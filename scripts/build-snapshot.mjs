// Generates web/public/topics.json (read-only snapshot) from topics.db (source of truth).
//
// Usage:
//   node scripts/build-snapshot.mjs                       # local DB from --db / TOPICS_DB / db_path.txt
//   node scripts/build-snapshot.mjs --db path/topics.db
//   node scripts/build-snapshot.mjs --upstream            # download the upstream QuranApp DB
//   node scripts/build-snapshot.mjs --url <raw .db url>   # download a specific DB (fork/branch)
//   --out <file>   output path (default web/public/topics.json)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, parseArgs, resolveDbPath, openDb } from "./lib/db.mjs";
import { buildSnapshot, toRawUrl, UPSTREAM_DB_URL } from "../shared/snapshot.js";

const { opts } = parseArgs(process.argv.slice(2));
const outPath = path.resolve(typeof opts.out === "string" ? opts.out : path.join(ROOT, "web", "public", "topics.json"));

let dbPath;
let source;
let cleanup = () => {};

const url = typeof opts.url === "string" ? toRawUrl(opts.url) : opts.upstream ? UPSTREAM_DB_URL : null;
if (url) {
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Download failed: HTTP ${res.status}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 15).toString("latin1") !== "SQLite format 3") {
    console.error("Downloaded file is not a SQLite database.");
    process.exit(1);
  }
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "topics-")), "topics.db");
  fs.writeFileSync(dbPath, buf);
  source = url;
  cleanup = () => fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
} else {
  dbPath = resolveDbPath(opts);
  source = path.basename(dbPath);
}

const dbSha256 = crypto.createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex").slice(0, 16);
const db = openDb(dbPath);
let snapshot;
try {
  snapshot = buildSnapshot((sql) => db.prepare(sql).all(), { source, dbFile: path.basename(source), dbSha256 });
} finally {
  db.close();
  cleanup();
}

const missingSlug = snapshot.topics.filter((t) => !t.slug);
if (missingSlug.length) console.warn(`Warning: ${missingSlug.length} topics have no slug and cannot receive translations`);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(snapshot));
console.log(
  `Wrote ${outPath}\n  source: ${source} (sha ${dbSha256})\n  topics: ${snapshot.topics.length}, edges: ${Object.entries(snapshot.edges)
    .map(([k, v]) => `${k}=${v.length}`)
    .join(" ")}`,
);
