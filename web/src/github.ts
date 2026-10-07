import { normalizeFile } from "@shared/translations.js";
import type { DraftFile } from "./store";

const API = "https://api.github.com";

/** "owner/repo" that receives translation PRs. Override with VITE_GITHUB_REPO at build time (e.g. for a fork). */
export const REPO: string = (import.meta.env.VITE_GITHUB_REPO as string | undefined) || "AlfaazPlus/QuranAppTopicsCMS";

export class GitHubError extends Error {}

async function gh(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (res.status === 401) throw new GitHubError("GitHub rejected the token. Check that it is correct and has not expired.");
  if (res.status === 403) throw new GitHubError("GitHub denied the request. The token may lack permission (needs contents and pull requests write access).");
  return res;
}

async function json<T = any>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).message ?? "";
    } catch {}
    throw new GitHubError(`${what} failed (${res.status}${detail ? `: ${detail}` : ""}).`);
  }
  return res.json();
}

const toB64 = (s: string) => {
  let bin = "";
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
};
const fromB64 = (b: string) => {
  const bin = atob(b.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PrText {
  title: string;
  body: string;
}

export function prText(draft: DraftFile, count: number, stale: number): PrText {
  return {
    title: `Add ${draft.name} (${draft.lang}) translations: ${count} topic${count === 1 ? "" : "s"}`,
    body:
      `Translations for **${draft.name}** (\`${draft.lang}\`), ${count} topic${count === 1 ? "" : "s"}.\n\n` +
      (stale ? `${stale} entr${stale === 1 ? "y was" : "ies were"} translated from older English text.\n\n` : "") +
      `Submitted from the translation site.`,
  };
}

export interface SubmitResult {
  url: string;
  merged: number; // entries kept from the existing upstream file
}

/**
 * Fork (if needed), branch, commit translations/<lang>.json and open a PR.
 * If the file already exists upstream, its entries are kept and this draft wins on conflicts.
 */
export async function submitPullRequest(
  token: string,
  repo: string,
  draft: DraftFile,
  text: PrText,
  onStep: (s: string) => void,
): Promise<SubmitResult> {
  const path = `translations/${draft.lang}.json`;

  onStep("Checking token...");
  const me = await json<{ login: string }>(await gh(token, "/user"), "Reading your GitHub account");
  const upstream = await json<{ default_branch: string; permissions?: { push?: boolean }; name: string; owner: { login: string } }>(
    await gh(token, `/repos/${repo}`),
    "Reading the repository",
  );
  const base = upstream.default_branch;

  // Where the branch lives: the repo itself when the user can push, otherwise their fork.
  let headRepo = repo;
  if (!upstream.permissions?.push) {
    onStep("Preparing your fork...");
    headRepo = `${me.login}/${upstream.name}`;
    await json(await gh(token, `/repos/${repo}/forks`, { method: "POST", body: JSON.stringify({}) }), "Forking the repository");
    for (let i = 0; i < 20; i++) {
      const r = await gh(token, `/repos/${headRepo}`);
      if (r.ok) break;
      if (i === 19) throw new GitHubError("Your fork is not ready yet. Please try again in a minute.");
      await sleep(1500);
    }
  }

  onStep("Creating a branch...");
  const baseRef = await json<{ object: { sha: string } }>(await gh(token, `/repos/${repo}/git/ref/heads/${base}`), "Reading the base branch");
  const branch = `translations/${draft.lang}-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`;
  await json(
    await gh(token, `/repos/${headRepo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseRef.object.sha }) }),
    "Creating the branch",
  );

  onStep("Preparing the file...");
  let sha: string | undefined;
  let merged = 0;
  let translations = { ...draft.translations };
  const existing = await gh(token, `/repos/${repo}/contents/${path}?ref=${base}`);
  if (existing.ok) {
    const info = await existing.json();
    sha = info.sha;
    try {
      const old = JSON.parse(fromB64(info.content));
      const kept = Object.keys(old.translations ?? {}).filter((s) => !(s in draft.translations)).length;
      merged = kept;
      translations = { ...old.translations, ...draft.translations };
    } catch {
      throw new GitHubError(`The existing ${path} in the repository is not valid JSON, so it was left untouched.`);
    }
  } else if (existing.status !== 404) {
    throw new GitHubError(`Reading the existing file failed (${existing.status}).`);
  }
  const file = normalizeFile({ ...draft, translations });

  onStep("Committing the translations...");
  await json(
    await gh(token, `/repos/${headRepo}/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({ message: text.title, content: toB64(JSON.stringify(file, null, 2) + "\n"), branch, ...(sha ? { sha } : {}) }),
    }),
    "Committing the file",
  );

  onStep("Opening the pull request...");
  const pr = await json<{ html_url: string }>(
    await gh(token, `/repos/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: text.title,
        body: text.body,
        head: headRepo === repo ? branch : `${me.login}:${branch}`,
        base,
        maintainer_can_modify: true,
      }),
    }),
    "Opening the pull request",
  );
  return { url: pr.html_url, merged };
}
