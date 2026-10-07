// Dependency-free helpers shared by the build scripts (Node) and the web app (browser).

/** cyrb53 string hash -> 53-bit integer. */
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Short hash (8 hex chars) of the English source fields of a topic.
 * Stored as `src` in contributions and as `h` in topics.json to detect stale translations.
 */
export function enHash(title, shortDescription, description) {
  const text = [title, shortDescription, description].map((v) => (v ?? "").trim()).join("\n");
  return cyrb53(text).toString(16).padStart(14, "0").slice(-8);
}
