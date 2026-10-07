import { useMemo, useState } from "react";
import { typeColor, type Topic } from "./data";
import { Graph } from "./Graph";
import { breadcrumb, childrenOf, parentsOf, relatedOf, ROOT_GROUPS } from "./relations";
import { RichText } from "./RichText";
import { statusOf, useStore } from "./store";
import { STATUS_TEXT } from "./Translate";

function TopicChip({ t, onOpen, dashed }: { t: Topic; onOpen: (t: Topic) => void; dashed?: boolean }) {
  const { lang, draft } = useStore();
  const status = lang ? statusOf(t, lang, draft) : "none";
  return (
    <button className={`chip ${dashed ? "dashed" : ""}`} onClick={() => onOpen(t)}>
      <span className="type-chip" style={{ background: typeColor(t.type) }} />
      {t.title}
      {t.ayahs > 0 && <small>{t.ayahs}</small>}
      {status !== "none" && <i className={`dot dot-${status}`} />}
    </button>
  );
}

function ChipList({ topics, onOpen, limit = 40, dashed }: { topics: Topic[]; onOpen: (t: Topic) => void; limit?: number; dashed?: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? topics : topics.slice(0, limit);
  return (
    <div className="chips">
      {shown.map((t) => (
        <TopicChip key={t.id} t={t} onOpen={onOpen} dashed={dashed} />
      ))}
      {topics.length > limit && (
        <button className="link" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${topics.length}`}
        </button>
      )}
    </div>
  );
}

export function Explorer({
  topicSlug,
  onNavigate,
  onTranslate,
}: {
  topicSlug: string | null;
  onNavigate: (slug: string | null) => void;
  onTranslate: (slug: string) => void;
}) {
  const { idx } = useStore();
  const open = (t: Topic) => t.slug && onNavigate(t.slug);
  const topic = topicSlug ? (idx.bySlug.get(topicSlug) ?? null) : null;

  return (
    <div className="page">
      <SearchBox onOpen={open} />
      {topic ? <TopicPage key={topic.id} topic={topic} onOpen={open} onHome={() => onNavigate(null)} onTranslate={onTranslate} /> : <Home onOpen={open} />}
    </div>
  );
}

function SearchBox({ onOpen }: { onOpen: (t: Topic) => void }) {
  const { idx } = useStore();
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return idx.snap.topics
      .filter((t) => t.slug && t.title.toLowerCase().includes(needle))
      .sort((a, b) => {
        const as = a.title.toLowerCase().startsWith(needle) ? 0 : 1;
        const bs = b.title.toLowerCase().startsWith(needle) ? 0 : 1;
        return as - bs || b.ayahs - a.ayahs;
      })
      .slice(0, 12);
  }, [q, idx]);

  return (
    <div className="searchbox">
      <input
        placeholder="Search a topic, e.g. Prayer, Joseph, Heaven..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search topics"
      />
      {q.trim() && (
        <ul className="dropdown">
          {results.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => {
                  onOpen(t);
                  setQ("");
                }}
              >
                <span className="type-chip" style={{ background: typeColor(t.type) }} />
                {t.title}
                <small>{t.ayahs ? `${t.ayahs} verses` : t.type}</small>
              </button>
            </li>
          ))}
          {!results.length && <li className="muted pad">No topics match "{q}".</li>}
        </ul>
      )}
    </div>
  );
}

function Home({ onOpen }: { onOpen: (t: Topic) => void }) {
  const { idx } = useStore();
  const popular = useMemo(() => [...idx.snap.topics].filter((t) => t.slug).sort((a, b) => b.ayahs - a.ayahs).slice(0, 16), [idx]);
  return (
    <div className="home">
      <h1>Browse topics</h1>
      <section>
        <h2>Most mentioned</h2>
        <ChipList topics={popular} onOpen={onOpen} />
      </section>

      {ROOT_GROUPS.map((g) => {
        const roots = idx.roots[g.lens].map((id) => idx.byId.get(id)).filter((t): t is Topic => !!t && !!t.slug);
        return (
          <section key={g.lens}>
            <h2>
              {g.title} <small>{roots.length}</small>
            </h2>
            {g.blurb && <p className="muted">{g.blurb}</p>}
            <ChipList topics={roots} onOpen={onOpen} limit={24} />
          </section>
        );
      })}
    </div>
  );
}

function TopicPage({
  topic,
  onOpen,
  onHome,
  onTranslate,
}: {
  topic: Topic;
  onOpen: (t: Topic) => void;
  onHome: () => void;
  onTranslate: (slug: string) => void;
}) {
  const { idx, lang, draft, languages } = useStore();
  const [showMap, setShowMap] = useState(false);
  const openSlug = (slug: string) => {
    const t = idx.bySlug.get(slug);
    if (t) onOpen(t);
  };
  const trail = breadcrumb(idx, topic.id);
  const parents = parentsOf(idx, topic.id);
  const kids = childrenOf(idx, topic.id);
  const related = relatedOf(idx, topic.id);
  const status = lang ? statusOf(topic, lang, draft) : "none";
  const mine = lang && topic.slug ? draft?.translations[topic.slug] : undefined;
  const inApp = lang ? topic.loc?.[lang] : undefined;
  const langName = languages.find((l) => l.code === lang)?.name;
  const shown = mine?.title || inApp?.title;

  return (
    <article className="topic">
      <nav className="crumbs">
        <button onClick={onHome}>Browse</button>
        {trail.map((t) => (
          <button key={t.id} onClick={() => onOpen(t)}>
            {t.title}
          </button>
        ))}
      </nav>

      <header className="topic-head">
        <h1>{topic.title}</h1>
        <span className="badge" style={{ background: typeColor(topic.type) }}>
          {topic.type.replace("_", " ")}
        </span>
        {topic.loc?.ar && (
          <span className="ar" dir="rtl">
            {topic.loc.ar.title}
          </span>
        )}
      </header>
      <p className="muted">
        {topic.ayahs ? `Mentioned in ${topic.ayahs} verse${topic.ayahs === 1 ? "" : "s"}` : "No verses linked directly"}
      </p>
      {topic.short && (
        <p className="lead">
          <RichText text={topic.short} onTopic={openSlug} />
        </p>
      )}
      {topic.desc && (
        <p className="rich-desc">
          <RichText text={topic.desc} onTopic={openSlug} />
        </p>
      )}

      <div className="callout">
        {lang && topic.slug ? (
          <>
            <div>
              <b>{langName}:</b>{" "}
              {shown ? (
                <span dir={draft?.dir} className="shown">
                  {shown}
                </span>
              ) : (
                <span className="muted">not translated yet</span>
              )}{" "}
              <span className={`pill pill-${status}`}>{STATUS_TEXT[status]}</span>
            </div>
            <button className="primary" onClick={() => onTranslate(topic.slug as string)}>
              {shown ? "Edit translation" : "Translate this topic"}
            </button>
          </>
        ) : (
          <div className="muted">Pick a language on the Translate page to start translating topics.</div>
        )}
      </div>

      {parents.length > 0 && (
        <section>
          <h2>Found under</h2>
          <ChipList topics={parents} onOpen={onOpen} />
        </section>
      )}
      {kids.length > 0 && (
        <section>
          <h2>
            Contains <small>{kids.length}</small>
          </h2>
          <ChipList topics={kids} onOpen={onOpen} />
        </section>
      )}
      {related.length > 0 && (
        <section>
          <h2>Related</h2>
          <ChipList topics={related} onOpen={onOpen} dashed />
        </section>
      )}
      <section>
        <button className="ghost" onClick={() => setShowMap(!showMap)}>
          {showMap ? "Hide map" : "Show map"}
        </button>
        {showMap && (
          <>
            <Graph idx={idx} topicId={topic.id} lang={lang} draft={draft} onSelect={(id) => {
              const t = idx.byId.get(id);
              if (t) onOpen(t);
            }} />
          </>
        )}
      </section>
    </article>
  );
}
