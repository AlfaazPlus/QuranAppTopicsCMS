import { useEffect, useMemo, useState } from "react";
import { del, get, set } from "idb-keyval";
import { normalizeFile, validateTranslationFile } from "@shared/translations.js";
import { GitHubError, prText, REPO, submitPullRequest } from "./github";
import { useStore, type DraftFile } from "./store";

const TOKEN_KEY = "ghtoken";
const TOKEN_URL =
  "https://github.com/settings/personal-access-tokens/new";

export function Submit({ onClose }: { onClose: () => void }) {
  const { idx, draft, exportFile, markExported } = useStore();
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ url: string; merged: number } | null>(null);
  const [guided, setGuided] = useState(false);

  // Load whether a token is already stored.
  useEffect(() => {
    void get<string>(TOKEN_KEY).then((t) => {
      setSaved(!!t);
      if (t) setToken(t);
    });
  }, []);

  const check = useMemo(() => {
    if (!draft) return null;
    const file = normalizeFile(draft) as DraftFile;
    const topicsBySlug = new Map([...idx.bySlug].map(([s, t]) => [s, { h: t.h }]));
    const res = validateTranslationFile(file, { topicsBySlug });
    return { file, count: Object.keys(file.translations).length, errors: res.errors as string[], stale: res.stats.stale as number };
  }, [draft, idx]);

  const repo = REPO;
  if (!draft || !check || !repo) return null;
  const text = prText(draft, check.count, check.stale);
  const blocked = check.errors.length > 0 || check.count === 0;

  const guidedUpload = async () => {
    exportFile();
    try {
      await navigator.clipboard.writeText(`${text.title}\n\n${text.body}`);
    } catch {}
    window.open(`https://github.com/${repo}/upload/main/translations`, "_blank", "noopener");
    setGuided(true);
  };

  const direct = async () => {
    setError("");
    setBusy("Starting...");
    try {
      const t = token.trim();
      await set(TOKEN_KEY, t);
      setSaved(true);
      const r = await submitPullRequest(t, repo, check.file, text, setBusy);
      markExported();
      setDone(r);
    } catch (e) {
      setError(e instanceof GitHubError ? e.message : `Could not reach GitHub: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="modal" onClick={busy ? undefined : onClose}>
      <div className="dialog wide" onClick={(e) => e.stopPropagation()}>
        <h3>Submit {draft.name} translations</h3>

        {done ? (
          <>
            <div className="note info">
              Pull request opened. {done.merged > 0 && `${done.merged} existing entries in the repository were kept. `}
              <a href={done.url} target="_blank" rel="noreferrer">
                View pull request
              </a>
            </div>
            <div className="row end">
              <button onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <p>
              <b>{check.count}</b> topic{check.count === 1 ? "" : "s"} ready
              {check.stale > 0 && <span className="muted"> ({check.stale} need review because the English changed)</span>}.
            </p>
            {check.count === 0 && <div className="note warn">Nothing to submit yet.</div>}
            {check.errors.length > 0 && (
              <div className="note warn">
                <div>
                  Fix these first:
                  <ul>
                    {check.errors.slice(0, 6).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                  {check.errors.length > 6 && `...and ${check.errors.length - 6} more`}
                </div>
              </div>
            )}

            <h4>Submit with GitHub token (one click)</h4>
            <label>
              Token{" "}
              <a href={TOKEN_URL} target="_blank" rel="noreferrer">
                create one
              </a>{" "}
              <span className="muted small">(public repositories, Contents and Pull requests: read and write)</span>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_..."
                autoComplete="off"
                disabled={!!busy}
              />
            </label>
            <div className="row">
              <button className="primary" disabled={blocked || !token.trim() || !!busy} onClick={() => void direct()}>
                Create pull request
              </button>
              {saved && (
                <button
                  className="link"
                  disabled={!!busy}
                  onClick={() => {
                    void del(TOKEN_KEY);
                    setToken("");
                    setSaved(false);
                  }}
                >
                  forget saved token
                </button>
              )}
            </div>
            <div className="muted small">The token stays in this browser only and is sent only to GitHub.</div>
            {busy && <div className="note info">{busy}</div>}
            {error && <div className="note warn">{error}</div>}

            <h4>Or upload manually</h4>
            <div className="row">
              <button disabled={blocked || !!busy} onClick={() => void guidedUpload()}>
                Download and open GitHub
              </button>
            </div>
            {guided && (
              <ol className="small">
                <li>
                  Drag the downloaded <code>{draft.lang}.json</code> into the GitHub page.
                </li>
                <li>Paste the copied title and description (already on your clipboard).</li>
                <li>Click "Create pull request".</li>
              </ol>
            )}

            <div className="row end">
              <button className="ghost" disabled={!!busy} onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
