// Translations file format (schema 1) - shared by the web app, CI validation and the merge CLI.
//
// {
//   "schema": 1, "lang": "ur", "name": "Urdu", "dir": "rtl",
//   "translations": { "<slug>": { "title": "...", "short_description": "...", "description": "...", "src": "a1b2c3d4" } }
// }

export const SCHEMA_VERSION = 1;
export const ALLOWED_FIELDS = ["title", "short_description", "description", "src"];
export const LIMITS = { title: 150, short_description: 500, description: 2000 };
export const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

// Control chars except \n (and \t) are not allowed; description may contain \n.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const HTML_RE = /<\/?[a-zA-Z!][^>]*>/;

/** Build the ordered, normalized file object (sorted keys, only meaningful fields). */
export function normalizeFile(file) {
  const translations = {};
  for (const slug of Object.keys(file.translations ?? {}).sort()) {
    const e = file.translations[slug];
    const out = {};
    for (const f of ["title", "short_description", "description"]) {
      const v = typeof e[f] === "string" ? e[f].trim() : "";
      if (v) out[f] = v;
    }
    if (!out.title) continue;
    if (e.src) out.src = e.src;
    translations[slug] = out;
  }
  return {
    schema: SCHEMA_VERSION,
    lang: file.lang,
    name: file.name,
    dir: file.dir === "rtl" ? "rtl" : "ltr",
    translations,
  };
}

/**
 * Validate a parsed translations file.
 * @param {any} file parsed JSON
 * @param {{ expectedLang?: string, topicsBySlug?: Map<string, {h: string}> }} ctx
 * @returns {{ errors: string[], warnings: string[], stats: { total: number, stale: number } }}
 */
export function validateTranslationFile(file, ctx = {}) {
  const errors = [];
  const warnings = [];
  const stats = { total: 0, stale: 0 };

  if (!file || typeof file !== "object" || Array.isArray(file)) {
    return { errors: ["File root must be a JSON object"], warnings, stats };
  }
  if (file.schema !== SCHEMA_VERSION) errors.push(`"schema" must be ${SCHEMA_VERSION}`);
  if (typeof file.lang !== "string" || !LANG_RE.test(file.lang)) errors.push(`"lang" must be a language code like "ur" or "pt-BR"`);
  else if (file.lang === "en") errors.push(`"lang" cannot be "en" (English is maintained in topics.db)`);
  else if (ctx.expectedLang && file.lang !== ctx.expectedLang) {
    errors.push(`"lang" is "${file.lang}" but the file name implies "${ctx.expectedLang}"`);
  }
  if (typeof file.name !== "string" || !file.name.trim()) errors.push(`"name" (language name) is required`);
  if (file.dir !== "ltr" && file.dir !== "rtl") errors.push(`"dir" must be "ltr" or "rtl"`);
  if (!file.translations || typeof file.translations !== "object" || Array.isArray(file.translations)) {
    errors.push(`"translations" must be an object keyed by topic slug`);
    return { errors, warnings, stats };
  }
  for (const k of Object.keys(file)) {
    if (!["schema", "lang", "name", "dir", "translations"].includes(k)) errors.push(`Unknown top-level key "${k}"`);
  }

  for (const [slug, entry] of Object.entries(file.translations)) {
    stats.total++;
    const where = `[${slug}]`;
    const topic = ctx.topicsBySlug?.get(slug);
    if (ctx.topicsBySlug && !topic) {
      errors.push(`${where} slug does not exist in topics.db`);
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${where} entry must be an object`);
      continue;
    }
    for (const k of Object.keys(entry)) {
      if (!ALLOWED_FIELDS.includes(k)) errors.push(`${where} field "${k}" is not allowed`);
    }
    if (typeof entry.title !== "string" || !entry.title.trim()) {
      errors.push(`${where} "title" is required`);
    }
    for (const f of Object.keys(LIMITS)) {
      const v = entry[f];
      if (v === undefined) continue;
      if (typeof v !== "string") {
        errors.push(`${where} "${f}" must be a string`);
        continue;
      }
      if (v.length > LIMITS[f]) errors.push(`${where} "${f}" exceeds ${LIMITS[f]} characters`);
      if (CONTROL_RE.test(v)) errors.push(`${where} "${f}" contains control characters`);
      if (HTML_RE.test(v)) errors.push(`${where} "${f}" must not contain HTML`);
      if (f === "title" && v.includes("\n")) errors.push(`${where} "title" must be a single line`);
      if (v !== v.trim()) warnings.push(`${where} "${f}" has leading/trailing whitespace`);
    }
    if (entry.src !== undefined) {
      if (typeof entry.src !== "string" || !/^[0-9a-f]{8}$/.test(entry.src)) {
        errors.push(`${where} "src" must be an 8-char hex hash`);
      } else if (topic && topic.h !== entry.src) {
        stats.stale++;
        warnings.push(`${where} stale: English text changed since this was translated`);
      }
    } else {
      warnings.push(`${where} has no "src" hash (cannot detect stale translations)`);
    }
  }
  return { errors, warnings, stats };
}
