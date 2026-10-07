import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./db.mjs";

export const TRANSLATIONS_DIR = path.join(ROOT, "translations");
export const SNAPSHOT_PATH = path.join(ROOT, "web", "public", "topics.json");

export function loadSnapshot(p = SNAPSHOT_PATH) {
  if (!fs.existsSync(p)) throw new Error(`Snapshot not found: ${p} (run: npm run snapshot)`);
  const snap = JSON.parse(fs.readFileSync(p, "utf8"));
  const topicsBySlug = new Map(snap.topics.filter((t) => t.slug).map((t) => [t.slug, t]));
  return { snap, topicsBySlug };
}

export function listTranslationFiles(dir = TRANSLATIONS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(dir, f));
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

export function langFromFileName(file) {
  return path.basename(file, ".json");
}
