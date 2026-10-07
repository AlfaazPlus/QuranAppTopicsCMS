import { useEffect, useMemo, useRef, useState } from "react";
import { LIMITS } from "@shared/translations.js";
import { typeColor, type Topic } from "./data";
import { COMMON_LANGUAGES } from "./languages";
import { breadcrumb, childrenOf } from "./relations";
import { RichText } from "./RichText";
import { statusOf, useStore, type Field, type Status } from "./store";

export const STATUS_TEXT: Record<Status, string> = {
  draft: "translated",
  stale: "needs review",
  app: "in app",
  none: "to do",
};

const STATUS_MARK: Record<Status, string> = { draft: "\u2713", app: "\u2713", stale: "!", none: "" };

type Tab = "todo" | "review" | "done" | "all";

export function Translate({
  topicSlug,
  onPick,
  onBrowse,
}: {
  topicSlug: string | null;
  onPick: (slug: string | null) => void;
  onBrowse: (slug: string) => void;
}) {
  const { idx, lang, draft } = useStore();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("todo");
  const [type, setType] = useState("");

  const all = useMemo(
    () => idx.snap.topics.filter((t) => t.slug).sort((a, b) => b.ayahs - a.ayahs || a.title.localeCompare(b.title)),
    [idx],
  );
  const types = useMemo(() => [...new Set(idx.snap.topics.map((t) => t.type))].sort(), [idx]);

  const counts = useMemo(() => {
    const c = { draft: 0, stale: 0, app: 0, none: 0 };
    if (lang) for (const t of all) c[statusOf(t, lang, draft)]++;
    return c;
  }, [all, lang, draft]);

  const selected = topicSlug ? (idx.bySlug.get(topicSlug) ?? null) : null;

  const visible = useMemo(() => {
    if (!lang) return [];
    const needle = q.trim().toLowerCase();
    return all.filter((t) => {
      if (selected && t.id === selected.id) return true; // keep the open topic in place while editing
      if (type && t.type !== type) return false;
      if (needle && !t.title.toLowerCase().includes(needle)) return false;
      const s = statusOf(t, lang, draft);
      switch (tab) {
        case "todo":
          return s === "none";
        case "review":
          return s === "stale";
        case "done":
          return s === "draft" || s === "app";
        default:
          return true;
      }
    });
  }, [all, lang, draft, q, type, tab, selected]);

  // Pin the topic in the URL. Otherwise the "current" topic is just the first one in the list, and it
  // changes as soon as the first keystroke moves that topic out of the To do list.
  const firstSlug = !selected ? (visible[0]?.slug ?? null) : null;
  useEffect(() => {
    if (!topicSlug && firstSlug) onPick(firstSlug);
  }, [topicSlug, firstSlug, onPick]);

  if (!lang || !draft) return <Welcome />;

  const current = selected ?? visible[0] ?? null;
  const pos = current ? visible.findIndex((t) => t.id === current.id) : -1;
  const prev = pos > 0 ? visible[pos - 1] : null;
  const next = pos >= 0 && pos < visible.length - 1 ? visible[pos + 1] : null;
  const total = all.length;
  const done = counts.draft + counts.stale + counts.app;
  const pct = Math.round((done / total) * 100);

  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: "todo", label: "To do", n: counts.none },
    ...(counts.stale > 0 ? [{ id: "review" as Tab, label: "Review", n: counts.stale }] : []),
    { id: "done", label: "Done", n: counts.draft + counts.app },
    { id: "all", label: "All" },
  ];

  return (
    <div className="translate">
      <aside className="queue">
        <div className="queue-head">
          <div className="progress-line">
            <b>{pct}%</b> translated
            <span className="muted">
              {done} / {total}
            </span>
          </div>
          <div className="bar">
            <span className="seg-app" style={{ width: `${(counts.app / total) * 100}%` }} />
            <span className="seg-draft" style={{ width: `${((counts.draft + counts.stale) / total) * 100}%` }} />
          </div>
          <div className="legend-line">
            <span>
              <i className="dot dot-draft" /> yours {counts.draft + counts.stale}
            </span>
            <span>
              <i className="dot dot-app" /> in app {counts.app}
            </span>
          </div>
        </div>

        <div className="tabs-row" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
              {t.label}
              {t.n !== undefined && <small>{t.n}</small>}
            </button>
          ))}
        </div>

        <div className="queue-tools">
          <input placeholder="Search topics" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="">Any type</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <QueueList items={visible.slice(0, 400)} currentId={current?.id ?? null} onPick={onPick} />
        {visible.length > 400 && <div className="muted pad small">Showing the first 400 of {visible.length}. Use search to narrow down.</div>}
        {!visible.length && (
          <div className="queue-empty">{tab === "todo" ? "Nothing left to do in this view." : "No topics match."}</div>
        )}
      </aside>

      <main className="bench">
        {current ? (
          <Workbench
            key={`${lang}:${current.id}`}
            topic={current}
            position={pos >= 0 ? `${pos + 1} / ${visible.length}` : ""}
            onPrev={prev ? () => onPick(prev.slug) : undefined}
            onNext={next ? () => onPick(next.slug) : undefined}
            onBrowse={onBrowse}
          />
        ) : (
          <div className="empty">
            <h2>All done here</h2>
          </div>
        )}
      </main>
    </div>
  );
}

function QueueList({ items, currentId, onPick }: { items: Topic[]; currentId: number | null; onPick: (slug: string | null) => void }) {
  const { lang, draft } = useStore();
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the open topic visible when navigating with Next/Previous.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-current='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

  return (
    <ul className="queue-list" ref={listRef}>
      {items.map((t) => {
        const s = lang ? statusOf(t, lang, draft) : "none";
        const isCurrent = currentId === t.id;
        return (
          <li key={t.id}>
            <button className={isCurrent ? "selected" : ""} data-current={isCurrent} onClick={() => onPick(t.slug)}>
              <span className="type-chip" style={{ background: typeColor(t.type) }} title={t.type.replace("_", " ")} />
              <span className="q-title">{t.title}</span>
              {t.ayahs > 0 && <span className="q-count">{t.ayahs}</span>}
              <span className={`q-status st-${s}`} title={STATUS_TEXT[s]}>
                {STATUS_MARK[s]}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Welcome() {
  const { addLanguage, importText } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  return (
    <div className="welcome">
      <h1>Which language will you translate into?</h1>
      <div className="lang-grid">
        {COMMON_LANGUAGES.map((l) => (
          <button key={l.code} onClick={() => addLanguage(l)}>
            {l.name}
            <small dir={l.dir}>{l.native}</small>
          </button>
        ))}
      </div>
      <p className="muted">
        Already have a file?{" "}
        <button className="link" onClick={() => fileRef.current?.click()}>
          Import it to continue
        </button>
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setMsg(importText(await f.text(), "replace").message);
        }}
      />
      {msg && <pre className="msg">{msg}</pre>}
    </div>
  );
}

function Workbench({
  topic,
  position,
  onPrev,
  onNext,
  onBrowse,
}: {
  topic: Topic;
  position: string;
  onPrev?: () => void;
  onNext?: () => void;
  onBrowse: (slug: string) => void;
}) {
  const { idx, lang, draft, setField, removeEntry } = useStore();
  if (!lang || !draft || !topic.slug) return null;

  const slug = topic.slug;
  const entry = draft.translations[slug];
  const status = statusOf(topic, lang, draft);
  const inApp = topic.loc?.[lang];
  const trail = breadcrumb(idx, topic.id);
  const kids = childrenOf(idx, topic.id);

  type Row = { field: Field; label: string; source?: string; multiline: boolean; app?: string };
  const rows: Row[] = [
    { field: "title", label: "Title", source: topic.title, multiline: false, app: inApp?.title },
    { field: "short_description", label: "Short description", source: topic.short, multiline: true, app: inApp?.short },
  ];
  // Description is not collected yet (the schema still supports it). Short description is always offered,
  // even if the English has none.
  const fields = rows;

  const useApp = () => {
    for (const f of fields) if (f.app) setField(topic, f.field, f.app);
  };
  const openTopic = (s: string) => onBrowse(s);

  return (
    <div
      className="workbench"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && onNext) {
          e.preventDefault();
          onNext();
        }
      }}
    >
      <div className="bench-bar">
        <div className="nav-btns">
          <button disabled={!onPrev} onClick={onPrev}>
            Previous
          </button>
          <span className="pos">{position}</span>
          <button className="primary" disabled={!onNext} onClick={onNext} title="Ctrl+Enter">
            Next topic
          </button>
        </div>
        <span className={`pill pill-${status}`}>{STATUS_TEXT[status]}</span>
      </div>

      <div className="topic-meta">
        {trail.length > 0 && (
          <div className="path">
            {trail.map((t, i) => (
              <span key={t.id}>
                {i > 0 && <span className="sep"> / </span>}
                {t.title}
              </span>
            ))}
          </div>
        )}
        <div className="facts">
          <span className="badge" style={{ background: typeColor(topic.type) }}>
            {topic.type.replace("_", " ")}
          </span>
          <span>{topic.ayahs ? `${topic.ayahs} verse${topic.ayahs === 1 ? "" : "s"}` : "no linked verses"}</span>
          <button className="link" onClick={() => onBrowse(slug)}>
            Open in Browse
          </button>
        </div>
        {kids.length > 0 && (
          <details className="subtopics">
            <summary>
              Includes {kids.length} sub-topic{kids.length === 1 ? "" : "s"}
            </summary>
            <div className="sub-chips">
              {kids.map((k) => (
                <span key={k.id}>{k.title}</span>
              ))}
            </div>
          </details>
        )}
      </div>

      {status === "stale" && (
        <div className="note warn">The English text changed after you translated this. Check your translation, then edit any field to confirm.</div>
      )}
      {inApp && !entry && (
        <div className="note info">
          <span>
            Already in the app: <b dir={draft.dir}>{inApp.title}</b>
          </span>
          <button onClick={useApp}>Edit this translation</button>
        </div>
      )}

      <div className="compare">
        <div className="col-head en">English (original)</div>
        <div className="col-head tr">{draft.name} (your translation)</div>
        {fields.map((f) => {
          const value = entry?.[f.field] ?? "";
          const max = LIMITS[f.field as keyof typeof LIMITS] as number;
          const rowsN = Math.min(10, Math.max(3, Math.ceil((f.source?.length ?? 0) / 70)));
          return (
            <div className="compare-row" key={f.field}>
              <div className={`src ${f.field === "title" ? "big" : ""}`}>
                <div className="label">{f.label}</div>
                <div className="text">{f.source ? <RichText text={f.source} onTopic={openTopic} /> : <i className="muted">No English text</i>}</div>
              </div>
              <div className="dst">
                <div className="label">
                  {f.label}
                  {f.field === "title" ? <span className="req"> required</span> : <span className="req"> optional</span>}
                  <small className={value.length >= max ? "over" : value.length > max * 0.8 ? "warn" : ""}>
                    {` ${value.length}/${max}`}
                  </small>
                </div>
                {f.multiline ? (
                  <textarea
                    dir={draft.dir}
                    lang={lang}
                    rows={rowsN}
                    value={value}
                    placeholder={`Translate to ${draft.name}`}
                    maxLength={max}
                    onChange={(e) => setField(topic, f.field, e.target.value)}
                  />
                ) : (
                  <input
                    className="big"
                    dir={draft.dir}
                    lang={lang}
                    value={value}
                    autoFocus
                    placeholder={`Translate to ${draft.name}`}
                    maxLength={max}
                    onChange={(e) => setField(topic, f.field, e.target.value)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bench-foot">
        {entry && (
          <button className="ghost danger" onClick={() => removeEntry(slug)}>
            Clear my translation
          </button>
        )}
        <span className="muted">Saved automatically</span>
      </div>
    </div>
  );
}
