// Validate translation files against the snapshot of topics.db.
// Usage: node scripts/validate.mjs [files...] [--snapshot path] [--strict] [--summary out.md]
//   default files: translations/*.json ; --strict treats warnings (stale entries) as errors.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "./lib/db.mjs";
import { loadSnapshot, listTranslationFiles, readJson, langFromFileName, SNAPSHOT_PATH } from "./lib/files.mjs";
import { validateTranslationFile } from "../shared/translations.js";

const { opts, positional } = parseArgs(process.argv.slice(2));
const files = positional.length ? positional.map((f) => path.resolve(f)) : listTranslationFiles();
const { topicsBySlug } = loadSnapshot(typeof opts.snapshot === "string" ? path.resolve(opts.snapshot) : SNAPSHOT_PATH);

let failed = false;
const md = ["## Translation validation", ""];

if (!files.length) {
  console.log("No translation files to validate.");
  md.push("No translation files found.");
}

for (const file of files) {
  const name = path.basename(file);
  let result;
  try {
    result = validateTranslationFile(readJson(file), { expectedLang: langFromFileName(file), topicsBySlug });
  } catch (e) {
    result = { errors: [`Invalid JSON: ${e.message}`], warnings: [], stats: { total: 0, stale: 0 } };
  }
  const bad = result.errors.length > 0 || (opts.strict && result.warnings.length > 0);
  if (bad) failed = true;

  console.log(`\n${bad ? "FAIL" : "OK  "} ${name}: ${result.stats.total} entries, ${result.stats.stale} stale`);
  for (const e of result.errors) console.log(`  error: ${e}`);
  for (const w of result.warnings) console.log(`  warn:  ${w}`);

  md.push(`### ${bad ? "FAIL" : "OK"} \`${name}\``, `${result.stats.total} entries, ${result.stats.stale} stale`, "");
  const shown = [...result.errors.map((e) => `- error: ${e}`), ...result.warnings.map((w) => `- warning: ${w}`)];
  if (shown.length) md.push(...shown.slice(0, 50), shown.length > 50 ? `- ...and ${shown.length - 50} more` : "", "");
}

if (typeof opts.summary === "string") fs.writeFileSync(opts.summary, md.join("\n"));
process.exit(failed ? 1 : 0);
