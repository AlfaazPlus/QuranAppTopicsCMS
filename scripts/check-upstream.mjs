// Cheap probe: HEAD the upstream topics.db and compare its ETag to the committed snapshot.
// Exits 0 always. Prints whether a full snapshot rebuild is needed.
// When GITHUB_OUTPUT is set, writes changed=true|false for workflow gating.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/db.mjs";
import { normalizeEtag, UPSTREAM_DB_URL } from "../shared/snapshot.js";

const snapshotPath = path.join(ROOT, "web", "public", "topics.json");

let stored = "";
try {
  stored = normalizeEtag(JSON.parse(fs.readFileSync(snapshotPath, "utf8")).upstreamEtag);
} catch {
  // Missing or invalid snapshot → treat as changed so the next step rebuilds.
}

const res = await fetch(UPSTREAM_DB_URL, { method: "HEAD" });
if (!res.ok) {
  console.error(`HEAD ${UPSTREAM_DB_URL} failed: HTTP ${res.status}`);
  process.exit(1);
}

const remote = normalizeEtag(res.headers.get("etag"));
if (!remote) {
  console.error("Upstream response had no ETag; cannot cheap-check. Forcing rebuild.");
  writeOutput(true);
  console.log("changed=true (no remote ETag)");
  process.exit(0);
}

const changed = !stored || stored !== remote;
writeOutput(changed);
console.log(
  changed
    ? `changed=true\n  stored: ${stored || "(none)"}\n  remote: ${remote}`
    : `changed=false\n  etag: ${remote}`,
);

function writeOutput(changed) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  fs.appendFileSync(out, `changed=${changed}\n`);
}
