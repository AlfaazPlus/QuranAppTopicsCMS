import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddLanguage } from "./AddLanguage";
import { buildIndex, type Index } from "./data";
import { DataSource } from "./DataSource";
import { Explorer } from "./Explorer";
import { REPO } from "./github";
import { Help } from "./Help";
import { Submit } from "./Submit";
import { useRoute } from "./route";
import { clearSource, loadDefaultSnapshot, loadInitialIndex, saveSource, SourceContext, useSource, type CustomSource } from "./source";
import { StoreProvider, useStore } from "./store";
import { Translate } from "./Translate";

export default function App() {
  const [idx, setIdx] = useState<Index | null>(null);
  const [custom, setCustom] = useState<CustomSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);

  useEffect(() => {
    loadInitialIndex().then(
      (r) => {
        setIdx(r.idx);
        setCustom(r.custom);
      },
      (e) => setError(String(e.message ?? e)),
    );
  }, []);

  const apply = useCallback(async (s: CustomSource) => {
    const next = buildIndex(s.snapshot); // throws if the data is malformed, before anything is saved
    await saveSource(s);
    setIdx(next);
    setCustom(s);
  }, []);

  const reset = useCallback(async () => {
    const snap = await loadDefaultSnapshot();
    await clearSource();
    setIdx(buildIndex(snap));
    setCustom(null);
  }, []);

  const ctx = useMemo(
    () => ({ custom, defaultInfo: null, apply, reset, openDialog: () => setSourceOpen(true) }),
    [custom, apply, reset],
  );

  if (error) return <div className="boot error">{error}</div>;
  if (!idx) return <div className="boot">Loading topics...</div>;
  return (
    <SourceContext.Provider value={ctx}>
      <StoreProvider idx={idx}>
        <Shell />
        {sourceOpen && <DataSource onClose={() => setSourceOpen(false)} />}
      </StoreProvider>
    </SourceContext.Provider>
  );
}

function Shell() {
  const { route, go } = useRoute();
  const { ready } = useStore();
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  if (!ready) return <div className="boot">Loading your drafts...</div>;

  const slug = route.params.get("topic");
  return (
    <div className="app">
      <Header page={route.page} go={go} onAddLanguage={() => setAdding(true)} onSubmit={() => setSubmitting(true)} />
      <div className="content">
        {route.page === "explore" && (
          <Explorer
            topicSlug={slug}
            onNavigate={(s) => go("explore", { topic: s ?? undefined })}
            onTranslate={(s) => go("translate", { topic: s })}
          />
        )}
        {route.page === "translate" && (
          <Translate
            topicSlug={slug}
            onPick={(s) => go("translate", { topic: s ?? undefined })}
            onBrowse={(s) => go("explore", { topic: s })}
          />
        )}
        {route.page === "help" && <Help />}
      </div>
      {adding && <AddLanguage onClose={() => setAdding(false)} />}
      {submitting && <Submit onClose={() => setSubmitting(false)} />}
    </div>
  );
}

function Header({
  page,
  go,
  onAddLanguage,
  onSubmit,
}: {
  page: string;
  go: ReturnType<typeof useRoute>["go"];
  onAddLanguage: () => void;
  onSubmit: () => void;
}) {
  const { lang, languages, setLang, isDirty, entryCount, exportFile, importText } = useStore();
  const { custom, openDialog, reset } = useSource();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const closeMenu = () => menuRef.current?.removeAttribute("open");

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const res = importText(await file.text(), "merge");
    setMsg({ ok: res.ok, text: res.message });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <header className="header">
      <div className="brand">
        <img src="favicon.svg" alt="" width={24} height={24} />
        QuranApp Topics CMS
      </div>
      <nav className="nav">
        <button className={page === "explore" ? "active" : ""} onClick={() => go("explore")}>
          Browse
        </button>
        <button className={page === "translate" ? "active" : ""} onClick={() => go("translate")}>
          Translate
        </button>
        <button className={page === "help" ? "active" : ""} onClick={() => go("help")}>
          Help
        </button>
      </nav>
      <div className="spacer" />
      <div className="lang">
        {lang && (
          <>
            <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
            {REPO && (
              <button className={isDirty ? "primary" : ""} disabled={!entryCount} onClick={onSubmit} title="Send your translations as a pull request">
                Submit
              </button>
            )}
            <button
              className="export-btn"
              disabled={!entryCount}
              onClick={exportFile}
              title={entryCount ? `Download ${lang}.json to submit` : "Nothing to export yet"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
              </svg>
              Export
              {entryCount > 0 && <span className="count">{entryCount}</span>}
            </button>
          </>
        )}
        <details className="menu" ref={menuRef}>
          <summary aria-label="More" title="More">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </summary>
          <div className="menu-body">
            {lang && (
              <>
                <button
                  onClick={() => {
                    closeMenu();
                    onAddLanguage();
                  }}
                >
                  Add another language
                </button>
                <button
                  onClick={() => {
                    closeMenu();
                    fileRef.current?.click();
                  }}
                >
                  Import a translation file
                </button>
              </>
            )}
            <button
              onClick={() => {
                closeMenu();
                openDialog();
              }}
            >
              Data source{custom ? " (custom)" : ""}
            </button>
          </div>
        </details>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      {custom && (
        <div className="banner">
          Using custom data: {custom.label}.
          <button className="link" onClick={openDialog}>
            details
          </button>
          <button className="link" onClick={() => void reset()}>
            use default
          </button>
        </div>
      )}
      {isDirty && (
        <div className="banner">
          You have changes that are not exported yet. Export regularly: clearing browser data removes drafts.{" "}
          <button className="link" onClick={REPO ? onSubmit : () => go("help")}>
            {REPO ? "Submit" : "How to submit"}
          </button>
        </div>
      )}
      {msg && (
        <div className={`banner ${msg.ok ? "ok" : "bad"}`}>
          <pre>{msg.text}</pre>
          <button className="link" onClick={() => setMsg(null)}>
            dismiss
          </button>
        </div>
      )}
    </header>
  );
}
