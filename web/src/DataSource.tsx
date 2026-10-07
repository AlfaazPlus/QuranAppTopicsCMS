import { useRef, useState } from "react";
import { loadFromFile, loadFromUrl, UPSTREAM_DB_URL, useSource } from "./source";
import { useStore } from "./store";

export function DataSource({ onClose }: { onClose: () => void }) {
  const { idx } = useStore();
  const { custom, apply, reset } = useSource();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const snap = idx.snap;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await fn();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="modal" onClick={busy ? undefined : onClose}>
      <div className="dialog wide" onClick={(e) => e.stopPropagation()}>
        <h3>Data source</h3>
        <div className="source-now">
          <div>
            <b>{custom ? "Custom data" : "Default data"}</b>
            <span className={`pill ${custom ? "pill-stale" : "pill-app"}`}>{custom ? "custom" : "default"}</span>
          </div>
          <div className="muted small">
            {snap.source ?? snap.dbFile}
            <br />
            {snap.topics.length} topics | sha {snap.dbSha256 || "n/a"} | generated {new Date(snap.generatedAt).toLocaleString()}
          </div>
        </div>
        <label>
          Upload a file (<code>.db</code> topics database or <code>topics.json</code> snapshot)
          <input
            ref={fileRef}
            type="file"
            accept=".db,.sqlite,.sqlite3,.json,application/json,application/octet-stream"
            disabled={!!busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void run("Reading file...", async () => apply(await loadFromFile(f)));
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
        </label>

        <label>
          Or load from a URL
          <div className="row tight">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={UPSTREAM_DB_URL} disabled={!!busy} />
            <button disabled={!url.trim() || !!busy} onClick={() => void run("Downloading...", async () => apply(await loadFromUrl(url)))}>
              Load
            </button>
          </div>
        </label>

        {busy && <div className="note info">{busy}</div>}
        {error && <div className="note warn">{error}</div>}
        {custom && (
          <div className="note warn">
            Topics missing from the repository's snapshot will be rejected in review.
          </div>
        )}

        <div className="row end">
          {custom && (
            <button disabled={!!busy} onClick={() => void run("Resetting...", reset)}>
              Use default data
            </button>
          )}
          <button className="ghost" disabled={!!busy} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
