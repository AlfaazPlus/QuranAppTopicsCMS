# translations/

One file per language: `translations/<lang>.json` (e.g. `ur.json`, `pt-BR.json`).

These files are *proposals*. `topics.db` is the source of truth; accepted entries are merged into it by a maintainer
(`npm run merge`). Create files with the web app (Translate -> Submit), not by hand.

Submitting: the site's **Submit** button either opens the pull request for you (using a GitHub token pasted once and
kept only in that browser; fine-grained, public repositories, Contents and Pull requests read/write) or downloads the
file and opens GitHub's upload page. If `translations/<lang>.json` already exists, entries are merged and the
contributor's win on conflicts. Set `VITE_GITHUB_REPO=owner/repo` at build time to enable it (the Pages workflow does).
