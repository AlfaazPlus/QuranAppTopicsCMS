// Builds the read-only snapshot (topics.json) from a topics.db.
// Environment independent: the caller supplies `query(sql) => rows[]` (objects keyed by column).
//   Node:    query = (sql) => nodeSqliteDb.prepare(sql).all()
//   Browser: query = (sql) => sql.js result converted to objects
import { enHash } from "./hash.js";

export const UPSTREAM_DB_URL =
  "https://raw.githubusercontent.com/AlfaazPlus/QuranApp/master/app/src/main/assets/db/topics.db";

/** Turns a github.com/.../blob/... page URL into the downloadable raw URL (other URLs are returned unchanged). */
export function toRawUrl(url) {
  const m = url.trim().match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : url.trim();
}

export const REQUIRED_TABLES = ["topics", "topic_localizations", "relationships", "topic_ayahs"];

const EDGE_KEY = {
  ontology_parent: "ontology",
  thematic_parent: "thematic",
  parent: "parent",
  related: "related",
};

const clean = (v) => (v == null || v === "" ? undefined : v);

/** Throws a readable error if the database does not look like a topics.db. */
export function assertTopicsSchema(query) {
  const have = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name));
  const missing = REQUIRED_TABLES.filter((t) => !have.has(t));
  if (missing.length) throw new Error(`Not a topics database: missing table(s) ${missing.join(", ")}`);
}

/**
 * @param {(sql: string) => any[]} query
 * @param {{ source: string, dbFile?: string, dbSha256?: string }} meta
 */
export function buildSnapshot(query, meta) {
  assertTopicsSchema(query);

  const topicRows = query("SELECT id, slug, type, flags, image_url FROM topics ORDER BY id");
  const locRows = query("SELECT topic_id, lang_code, title, short_description, description FROM topic_localizations");
  const ayahCounts = new Map(query("SELECT topic_id, COUNT(*) AS c FROM topic_ayahs GROUP BY topic_id").map((r) => [r.topic_id, r.c]));
  const relRows = query("SELECT src_topic_id, tgt_topic_id, type FROM relationships ORDER BY id");

  const locByTopic = new Map();
  for (const r of locRows) {
    if (!locByTopic.has(r.topic_id)) locByTopic.set(r.topic_id, {});
    locByTopic.get(r.topic_id)[r.lang_code] = {
      title: r.title,
      short: clean(r.short_description),
      desc: clean(r.description),
    };
  }

  const languages = new Set();
  const topics = topicRows.map((t) => {
    const loc = locByTopic.get(t.id) ?? {};
    const en = loc.en ?? { title: t.slug ?? "" };
    const other = {};
    for (const [lang, v] of Object.entries(loc)) {
      if (lang === "en") continue;
      languages.add(lang);
      other[lang] = v;
    }
    return {
      id: t.id,
      slug: t.slug,
      type: t.type,
      flags: t.flags ?? 0,
      title: en.title,
      short: en.short,
      desc: en.desc,
      ayahs: ayahCounts.get(t.id) ?? 0,
      h: enHash(en.title, en.short, en.desc),
      ...(Object.keys(other).length ? { loc: other } : {}),
      ...(clean(t.image_url) ? { image: t.image_url } : {}),
    };
  });

  const edges = { ontology: [], thematic: [], parent: [], related: [] };
  for (const r of relRows) {
    const k = EDGE_KEY[r.type];
    if (k) edges[k].push([r.src_topic_id, r.tgt_topic_id]); // [child, parent] (related: [a, b])
  }

  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    source: meta.source,
    dbFile: meta.dbFile ?? meta.source.split("/").pop(),
    dbSha256: meta.dbSha256 ?? "",
    languages: [...languages].sort(),
    topics,
    edges,
  };
}
