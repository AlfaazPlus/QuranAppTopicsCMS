// Selectively merge reviewed translation files into topics.db (the source of truth).
//
// Usage:
//   node scripts/merge.mjs translations/ur.json [more files...] [options]
//
// Options:
//   --db <path>       topics.db to modify (default: TOPICS_DB env or db_path.txt)
//   --lang <code>     only merge files for this language
//   --only <file>     text file with one slug per line; merge only these topics
//   --skip-stale      skip entries whose English source changed since translation
//   --dry-run         print what would change, write nothing
//   --allow-en        allow merging into the "en" language (default: refused)
//   --backup-dir <d>  where backups/reports go (default: ./backups)
//
// Only INSERT/UPDATE on topic_localizations (+ topics.updated_at). Never touches
// relationships or topic_ayahs, and refuses to run if the DB schema changes.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, parseArgs, resolveDbPath, openDb } from "./lib/db.mjs";
import { readJson, langFromFileName } from "./lib/files.mjs";
import { validateTranslationFile } from "../shared/translations.js";
import { enHash } from "../shared/hash.js";

const { opts, positional } = parseArgs(process.argv.slice(2));
if (!positional.length) {
  console.error("Usage: node scripts/merge.mjs <translations/xx.json...> [--dry-run] [--lang xx] [--only slugs.txt] [--skip-stale] [--allow-en]");
  process.exit(2);
}

const dryRun = !!opts["dry-run"];
const dbPath = resolveDbPath(opts);
const backupDir = path.resolve(typeof opts["backup-dir"] === "string" ? opts["backup-dir"] : path.join(ROOT, "backups"));
const onlySlugs =
  typeof opts.only === "string"
    ? new Set(
        fs
          .readFileSync(opts.only, "utf8")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter((s) => s && !s.startsWith("#")),
      )
    : null;

function schemaFingerprint(db) {
  const rows = db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all();
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

// ---- Load current state from the DB (read-only pass) --------------------------------------
const readDb = openDb(dbPath, { readOnly: true });
const topicRows = readDb.prepare("SELECT id, slug FROM topics WHERE slug IS NOT NULL").all();
const enRows = new Map(
  readDb
    .prepare("SELECT topic_id, title, short_description, description FROM topic_localizations WHERE lang_code = 'en'")
    .all()
    .map((r) => [r.topic_id, r]),
);
const topicsBySlug = new Map(
  topicRows.map((t) => {
    const en = enRows.get(t.id);
    return [t.slug, { id: t.id, h: enHash(en?.title ?? t.slug, en?.short_description, en?.description) }];
  }),
);
const getLoc = readDb.prepare(
  "SELECT title, short_description, description FROM topic_localizations WHERE topic_id = ? AND lang_code = ?",
);

// ---- Plan -------------------------------------------------------------------------------------
const plan = []; // { lang, slug, topicId, action: new|update|unchanged|skipped, reason?, values }
let hadError = false;

for (const f of positional) {
  const file = path.resolve(f);
  const fileLang = langFromFileName(file);
  if (typeof opts.lang === "string" && fileLang !== opts.lang) continue;

  let data;
  try {
    data = readJson(file);
  } catch (e) {
    console.error(`${path.basename(file)}: invalid JSON: ${e.message}`);
    hadError = true;
    continue;
  }
  const { errors, warnings } = validateTranslationFile(data, { expectedLang: fileLang, topicsBySlug });
  const fatal = opts["allow-en"] ? errors.filter((e) => !e.includes('cannot be "en"')) : errors;
  if (fatal.length) {
    console.error(`${path.basename(file)}: validation failed`);
    fatal.slice(0, 20).forEach((e) => console.error(`  error: ${e}`));
    hadError = true;
    continue;
  }
  if (data.lang === "en" && !opts["allow-en"]) {
    console.error(`${path.basename(file)}: refusing to modify "en" without --allow-en`);
    hadError = true;
    continue;
  }
  const staleSlugs = new Set(warnings.filter((w) => w.includes("stale")).map((w) => w.match(/^\[(.+?)\]/)?.[1]));

  for (const [slug, entry] of Object.entries(data.translations)) {
    const topic = topicsBySlug.get(slug);
    const rec = { lang: data.lang, slug, topicId: topic.id, values: entry, action: "", reason: "" };
    if (onlySlugs && !onlySlugs.has(slug)) {
      rec.action = "skipped";
      rec.reason = "not in --only list";
    } else if (opts["skip-stale"] && staleSlugs.has(slug)) {
      rec.action = "skipped";
      rec.reason = "stale";
    } else {
      const cur = getLoc.get(topic.id, data.lang);
      if (!cur) rec.action = "new";
      else {
        const changed =
          cur.title !== entry.title ||
          (entry.short_description !== undefined && (cur.short_description ?? "") !== entry.short_description) ||
          (entry.description !== undefined && (cur.description ?? "") !== entry.description);
        rec.action = changed ? "update" : "unchanged";
        if (changed) rec.before = cur;
      }
      if (staleSlugs.has(slug)) rec.reason = "stale";
    }
    plan.push(rec);
  }
}
readDb.close();

if (hadError) {
  console.error("\nAborting: fix the errors above (nothing was written).");
  process.exit(1);
}

// ---- Report -----------------------------------------------------------------------------------
const count = (a) => plan.filter((p) => p.action === a).length;
const summary = { new: count("new"), update: count("update"), unchanged: count("unchanged"), skipped: count("skipped") };
const byLang = {};
for (const p of plan) (byLang[p.lang] ??= { new: 0, update: 0, unchanged: 0, skipped: 0 })[p.action]++;

console.log(`${dryRun ? "[dry-run] " : ""}Database: ${dbPath}`);
for (const [lang, c] of Object.entries(byLang)) {
  console.log(`  ${lang}: +${c.new} new, ~${c.update} updated, =${c.unchanged} unchanged, -${c.skipped} skipped`);
}
for (const p of plan.filter((x) => x.action === "update").slice(0, 25)) {
  console.log(`  update ${p.lang}/${p.slug}: "${p.before.title}" -> "${p.values.title}"${p.reason ? ` (${p.reason})` : ""}`);
}
const staleApplied = plan.filter((p) => (p.action === "new" || p.action === "update") && p.reason === "stale").length;
if (staleApplied) console.log(`  note: ${staleApplied} stale entries will be applied (use --skip-stale to exclude)`);

if (dryRun) {
  console.log("\nDry run complete. No changes written.");
  process.exit(0);
}
const toApply = plan.filter((p) => p.action === "new" || p.action === "update");
if (!toApply.length) {
  console.log("\nNothing to apply.");
  process.exit(0);
}

// ---- Apply (backup first, single transaction, schema check) ------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `${path.basename(dbPath)}.${stamp}.bak`);
fs.copyFileSync(dbPath, backupPath);

const db = openDb(dbPath, { readOnly: false });
const schemaBefore = schemaFingerprint(db);
const upsert = db.prepare(`
  INSERT INTO topic_localizations (topic_id, lang_code, title, short_description, description)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(topic_id, lang_code) DO UPDATE SET
    title = excluded.title,
    short_description = COALESCE(excluded.short_description, topic_localizations.short_description),
    description = COALESCE(excluded.description, topic_localizations.description)
`);
const touch = db.prepare("UPDATE topics SET updated_at = ? WHERE id = ?");
const now = Math.floor(Date.now() / 1000);

try {
  db.exec("BEGIN");
  for (const p of toApply) {
    upsert.run(p.topicId, p.lang, p.values.title, p.values.short_description ?? null, p.values.description ?? null);
    touch.run(now, p.topicId);
  }
  if (schemaFingerprint(db) !== schemaBefore) throw new Error("Schema changed unexpectedly; rolling back");
  db.exec("COMMIT");
} catch (e) {
  try {
    db.exec("ROLLBACK");
  } catch {}
  db.close();
  fs.copyFileSync(backupPath, dbPath);
  console.error(`\nMerge failed, restored backup: ${e.message}`);
  process.exit(1);
}
const integrity = db.prepare("PRAGMA integrity_check").get();
db.close();

const reportPath = path.join(backupDir, `merge-report.${stamp}.json`);
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      db: dbPath,
      files: positional,
      summary,
      byLang,
      applied: toApply.map(({ lang, slug, action, reason }) => ({ lang, slug, action, reason })),
    },
    null,
    2,
  ),
);
console.log(`\nApplied ${toApply.length} changes. Integrity: ${Object.values(integrity)[0]}`);
console.log(`Backup: ${backupPath}\nReport: ${reportPath}`);
console.log("Next: npm run snapshot, then commit topics.db and redeploy the site.");
