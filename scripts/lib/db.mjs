import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Tiny argv parser: `--key value`, `--flag`, and positional args. */
export function parseArgs(argv) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) opts[key] = true;
      else {
        opts[key] = next;
        i++;
      }
    } else positional.push(a);
  }
  return { opts, positional };
}

/** Resolve the topics.db path: --db flag, TOPICS_DB env, or the first line of db_path.txt. */
export function resolveDbPath(opts = {}) {
  const fromFlag = typeof opts.db === "string" ? opts.db : null;
  const fromEnv = process.env.TOPICS_DB || null;
  let fromFile = null;
  const f = path.join(ROOT, "db_path.txt");
  if (fs.existsSync(f)) fromFile = fs.readFileSync(f, "utf8").split(/\r?\n/)[0].trim() || null;
  const p = fromFlag || fromEnv || fromFile;
  if (!p) throw new Error("No database path. Use --db <path>, TOPICS_DB, or db_path.txt");
  if (!fs.existsSync(p)) throw new Error(`Database not found: ${p}`);
  return p;
}

export function openDb(dbPath, { readOnly = true } = {}) {
  return new DatabaseSync(dbPath, { readOnly });
}
