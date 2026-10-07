import { createContext, useContext } from "react";
import { del, get, set } from "idb-keyval";
import { buildSnapshot, toRawUrl, UPSTREAM_DB_URL } from "@shared/snapshot.js";
import { buildIndex, type Index, type Snapshot } from "./data";

export { UPSTREAM_DB_URL };

export interface CustomSource {
  kind: "url" | "db" | "json";
  label: string;
  snapshot: Snapshot;
}

const SOURCE_KEY = "source";

export async function loadSavedSource(): Promise<CustomSource | null> {
  try {
    return (await get<CustomSource>(SOURCE_KEY)) ?? null;
  } catch {
    return null;
  }
}
export const saveSource = (s: CustomSource) => set(SOURCE_KEY, s);
export const clearSource = () => del(SOURCE_KEY);

/** Default data: the topics.json bundled with the site (generated from the upstream DB at deploy time). */
export async function loadDefaultSnapshot(): Promise<Snapshot> {
  const res = await fetch(`${import.meta.env.BASE_URL}topics.json`);
  if (!res.ok) throw new Error(`Could not load topics.json (${res.status}). Run: npm run snapshot:upstream`);
  return (await res.json()) as Snapshot;
}

export async function loadInitialIndex(): Promise<{ idx: Index; custom: CustomSource | null }> {
  const custom = await loadSavedSource();
  if (custom) {
    try {
      return { idx: buildIndex(custom.snapshot), custom };
    } catch {
      await clearSource();
    }
  }
  return { idx: buildIndex(await loadDefaultSnapshot()), custom: null };
}

async function sha256Short(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) return "";
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

const isSqlite = (b: Uint8Array) => new TextDecoder("latin1").decode(b.subarray(0, 15)) === "SQLite format 3";

/** Parse a topics.db in the browser (sql.js is loaded lazily, only when needed). */
export async function snapshotFromDbBytes(bytes: Uint8Array, source: string): Promise<Snapshot> {
  if (!isSqlite(bytes)) throw new Error("This file is not a SQLite database.");
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import("sql.js"),
    import("sql.js/dist/sql-wasm.wasm?url"),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database(bytes);
  try {
    const query = (sql: string) => {
      const out: Record<string, unknown>[] = [];
      for (const r of db.exec(sql)) {
        for (const values of r.values) {
          const row: Record<string, unknown> = {};
          r.columns.forEach((c, i) => (row[c] = values[i]));
          out.push(row);
        }
      }
      return out;
    };
    return buildSnapshot(query, { source, dbFile: source.split("/").pop() || source, dbSha256: await sha256Short(bytes) }) as Snapshot;
  } finally {
    db.close();
  }
}

export function snapshotFromJson(text: string): Snapshot {
  let s: Snapshot;
  try {
    s = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("The file is not valid JSON or SQLite.");
  }
  if (!s || !Array.isArray(s.topics) || !s.edges || !Array.isArray(s.edges.ontology)) {
    throw new Error("This JSON is not a topics snapshot (expected topics + edges).");
  }
  return { ...s, source: s.source ?? "uploaded topics.json" };
}

export async function loadFromFile(file: File): Promise<CustomSource> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isSqlite(bytes)) return { kind: "db", label: file.name, snapshot: await snapshotFromDbBytes(bytes, file.name) };
  return { kind: "json", label: file.name, snapshot: snapshotFromJson(new TextDecoder().decode(bytes)) };
}

export async function loadFromUrl(input: string): Promise<CustomSource> {
  const url = toRawUrl(input);
  if (!/^https?:\/\//.test(url)) throw new Error("Enter a full http(s) URL.");
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Could not download that URL (network error or the server blocks cross-origin requests).");
  }
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (isSqlite(bytes)) return { kind: "url", label: url, snapshot: await snapshotFromDbBytes(bytes, url) };
  return { kind: "url", label: url, snapshot: snapshotFromJson(new TextDecoder().decode(bytes)) };
}

interface SourceCtx {
  custom: CustomSource | null;
  defaultInfo: Snapshot | null;
  apply: (s: CustomSource) => Promise<void>;
  reset: () => Promise<void>;
  openDialog: () => void;
}

export const SourceContext = createContext<SourceCtx | null>(null);
export const useSource = () => {
  const c = useContext(SourceContext);
  if (!c) throw new Error("SourceContext missing");
  return c;
};
