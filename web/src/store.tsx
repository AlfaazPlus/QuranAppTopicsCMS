import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { get, set, keys } from "idb-keyval";
import { normalizeFile, validateTranslationFile } from "@shared/translations.js";
import type { Index, Topic } from "./data";
import { COMMON_LANGUAGES, type LangInfo } from "./languages";

export type Field = "title" | "short_description" | "description";

export interface DraftEntry {
  title?: string;
  short_description?: string;
  description?: string;
  src?: string;
}

export interface DraftFile {
  schema: 1;
  lang: string;
  name: string;
  dir: "ltr" | "rtl";
  translations: Record<string, DraftEntry>;
}

export type Status = "draft" | "stale" | "app" | "none";

export function statusOf(topic: Topic, lang: string, draft: DraftFile | undefined): Status {
  const e = topic.slug ? draft?.translations[topic.slug] : undefined;
  if (e && e.title?.trim()) return e.src && e.src !== topic.h ? "stale" : "draft";
  if (topic.loc?.[lang]) return "app";
  return "none";
}

interface Ctx {
  idx: Index;
  ready: boolean;
  lang: string | null;
  languages: LangInfo[];
  draft: DraftFile | undefined;
  setLang: (code: string) => void;
  addLanguage: (info: LangInfo) => void;
  setField: (topic: Topic, field: Field, value: string) => void;
  removeEntry: (slug: string) => void;
  importText: (text: string, mode: "merge" | "replace") => { ok: boolean; message: string };
  exportFile: () => void;
  markExported: () => void;
  dirtyLangs: string[];
  isDirty: boolean;
  entryCount: number;
}

const StoreCtx = createContext<Ctx | null>(null);
export const useStore = () => {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
};

const draftKey = (lang: string) => `draft:${lang}`;
const META_KEY = "meta";

function serialize(d: DraftFile) {
  return JSON.stringify(normalizeFile(d));
}

export function StoreProvider({ idx, children }: { idx: Index; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftFile>>({});
  const [lang, setLangState] = useState<string | null>(null);
  const [exported, setExported] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, number>>({});

  // Load persisted state once.
  useEffect(() => {
    (async () => {
      const loaded: Record<string, DraftFile> = {};
      for (const k of await keys()) {
        if (typeof k === "string" && k.startsWith("draft:")) {
          const d = await get<DraftFile>(k);
          if (d) loaded[d.lang] = d;
        }
      }
      const meta = await get<{ lang?: string; exported?: Record<string, string> }>(META_KEY);
      setDrafts(loaded);
      setExported(meta?.exported ?? {});
      setLangState(meta?.lang && loaded[meta.lang] ? meta.lang : (Object.keys(loaded)[0] ?? null));
      setReady(true);
    })();
  }, []);

  const persistDraft = useCallback((d: DraftFile) => {
    window.clearTimeout(timers.current[d.lang]);
    timers.current[d.lang] = window.setTimeout(() => void set(draftKey(d.lang), d), 250);
  }, []);

  const persistMeta = useCallback((l: string | null, ex: Record<string, string>) => {
    void set(META_KEY, { lang: l ?? undefined, exported: ex });
  }, []);

  const updateDraft = useCallback(
    (code: string, fn: (d: DraftFile) => DraftFile) => {
      setDrafts((prev) => {
        const cur = prev[code];
        if (!cur) return prev;
        const next = fn(cur);
        persistDraft(next);
        return { ...prev, [code]: next };
      });
    },
    [persistDraft],
  );

  const setLang = useCallback(
    (code: string) => {
      setLangState(code);
      persistMeta(code, exported);
    },
    [exported, persistMeta],
  );

  const addLanguage = useCallback(
    (info: LangInfo) => {
      setDrafts((prev) => {
        if (prev[info.code]) return prev;
        const d: DraftFile = { schema: 1, lang: info.code, name: info.name, dir: info.dir, translations: {} };
        void set(draftKey(info.code), d);
        return { ...prev, [info.code]: d };
      });
      setLangState(info.code);
      persistMeta(info.code, exported);
    },
    [exported, persistMeta],
  );

  const setField = useCallback(
    (topic: Topic, field: Field, value: string) => {
      if (!lang || !topic.slug) return;
      const slug = topic.slug;
      updateDraft(lang, (d) => {
        const entry = { ...(d.translations[slug] ?? {}), [field]: value, src: topic.h };
        const empty = !entry.title?.trim() && !entry.short_description?.trim() && !entry.description?.trim();
        const translations = { ...d.translations };
        if (empty) delete translations[slug];
        else translations[slug] = entry;
        return { ...d, translations };
      });
    },
    [lang, updateDraft],
  );

  const removeEntry = useCallback(
    (slug: string) => {
      if (!lang) return;
      updateDraft(lang, (d) => {
        const translations = { ...d.translations };
        delete translations[slug];
        return { ...d, translations };
      });
    },
    [lang, updateDraft],
  );

  const topicsBySlug = useMemo(() => new Map([...idx.bySlug].map(([s, t]) => [s, { h: t.h }])), [idx]);

  const importText = useCallback(
    (text: string, mode: "merge" | "replace") => {
      let parsed: any;
      try {
        parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
      } catch (e) {
        return { ok: false, message: `Not valid JSON: ${(e as Error).message}` };
      }
      const res = validateTranslationFile(parsed, { topicsBySlug });
      if (res.errors.length) {
        return {
          ok: false,
          message: `File rejected:\n${res.errors.slice(0, 8).join("\n")}${res.errors.length > 8 ? `\n...and ${res.errors.length - 8} more` : ""}`,
        };
      }
      const code: string = parsed.lang;
      if (!COMMON_LANGUAGES.some((l) => l.code === code)) {
        return { ok: false, message: `Language "${code}" is not one of the supported languages.` };
      }
      const incoming = normalizeFile(parsed) as DraftFile;
      setDrafts((prev) => {
        const base = prev[code];
        const next: DraftFile =
          mode === "merge" && base
            ? { ...base, name: incoming.name, dir: incoming.dir, translations: { ...base.translations, ...incoming.translations } }
            : incoming;
        void set(draftKey(code), next);
        return { ...prev, [code]: next };
      });
      // Imported content equals a file that already exists elsewhere (repo/export), so treat as saved.
      if (mode === "replace") {
        const ex = { ...exported, [code]: JSON.stringify(normalizeFile(incoming)) };
        setExported(ex);
        persistMeta(code, ex);
      }
      setLangState(code);
      return {
        ok: true,
        message: `Imported ${Object.keys(incoming.translations).length} entries for ${incoming.name} (${mode}).${res.stats.stale ? ` ${res.stats.stale} are stale.` : ""}`,
      };
    },
    [topicsBySlug, exported, persistMeta],
  );

  const exportFile = useCallback(() => {
    if (!lang || !drafts[lang]) return;
    const normalized = normalizeFile(drafts[lang]);
    const blob = new Blob([JSON.stringify(normalized, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lang}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    const ex = { ...exported, [lang]: JSON.stringify(normalized) };
    setExported(ex);
    persistMeta(lang, ex);
  }, [lang, drafts, exported, persistMeta]);

  // Mark the current draft as saved/submitted without downloading (used after a direct PR).
  const markExported = useCallback(() => {
    if (!lang || !drafts[lang]) return;
    const ex = { ...exported, [lang]: JSON.stringify(normalizeFile(drafts[lang])) };
    setExported(ex);
    persistMeta(lang, ex);
  }, [lang, drafts, exported, persistMeta]);

  const dirtyLangs = useMemo(
    () =>
      Object.values(drafts)
        .filter((d) => {
          const cur = serialize(d);
          const baseline = exported[d.lang] ?? serialize({ ...d, translations: {} });
          return cur !== baseline;
        })
        .map((d) => d.lang),
    [drafts, exported],
  );

  useEffect(() => {
    if (!dirtyLangs.length) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirtyLangs.length]);

  const languages = useMemo(() => {
    const map = new Map<string, LangInfo>();
    for (const d of Object.values(drafts)) map.set(d.lang, { code: d.lang, name: d.name, dir: d.dir });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [drafts]);

  const draft = lang ? drafts[lang] : undefined;
  const value: Ctx = {
    idx,
    ready,
    lang,
    languages,
    draft,
    setLang,
    addLanguage,
    setField,
    removeEntry,
    importText,
    exportFile,
    markExported,
    dirtyLangs,
    isDirty: !!lang && dirtyLangs.includes(lang),
    entryCount: draft ? Object.keys(normalizeFile(draft).translations).length : 0,
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function suggestLanguages(existingCodes: string[]): LangInfo[] {
  return COMMON_LANGUAGES.filter((l) => !existingCodes.includes(l.code));
}
