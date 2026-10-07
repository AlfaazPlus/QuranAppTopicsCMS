export type Lens = "ontology" | "thematic" | "parent";
export const LENSES: { id: Lens; label: string; hint: string }[] = [
  { id: "ontology", label: "Ontology", hint: "Entity types (is-a)" },
  { id: "thematic", label: "Thematic", hint: "Curated themes" },
  { id: "parent", label: "Index", hint: "Keyword index tree" },
];

export interface LocText {
  title: string;
  short?: string;
  desc?: string;
}

export interface Topic {
  id: number;
  slug: string | null;
  type: string;
  flags: number;
  title: string;
  short?: string;
  desc?: string;
  ayahs: number;
  h: string;
  loc?: Record<string, LocText>;
  image?: string;
}

export interface Snapshot {
  schema: number;
  generatedAt: string;
  /** Where the database came from (URL or file name). */
  source?: string;
  dbFile: string;
  dbSha256: string;
  languages: string[];
  topics: Topic[];
  edges: Record<Lens | "related", [number, number][]>;
}

export interface Index {
  snap: Snapshot;
  byId: Map<number, Topic>;
  bySlug: Map<string, Topic>;
  children: Record<Lens, Map<number, number[]>>;
  parents: Record<Lens, Map<number, number[]>>;
  related: Map<number, number[]>;
  roots: Record<Lens, number[]>;
}

function push(map: Map<number, number[]>, k: number, v: number) {
  const a = map.get(k);
  if (a) a.push(v);
  else map.set(k, [v]);
}

export function buildIndex(snap: Snapshot): Index {
  const byId = new Map(snap.topics.map((t) => [t.id, t]));
  const bySlug = new Map(snap.topics.filter((t) => t.slug).map((t) => [t.slug as string, t]));
  const children = {} as Index["children"];
  const parents = {} as Index["parents"];
  const roots = {} as Index["roots"];
  const byTitle = (a: number, b: number) =>
    (byId.get(a)?.title ?? "").toLowerCase().localeCompare((byId.get(b)?.title ?? "").toLowerCase());

  for (const lens of ["ontology", "thematic", "parent"] as Lens[]) {
    const ch = new Map<number, number[]>();
    const pa = new Map<number, number[]>();
    for (const [child, parent] of snap.edges[lens]) {
      push(ch, parent, child);
      push(pa, child, parent);
    }
    for (const arr of ch.values()) arr.sort(byTitle);
    children[lens] = ch;
    parents[lens] = pa;

    // Roots mirror the Android app: flagged topics without a parent in the lens.
    // The "parent" (index) lens has no flag; roots are parents that are never children.
    const flagBit = lens === "ontology" ? 2 : lens === "thematic" ? 1 : 0;
    const r =
      lens === "parent"
        ? [...ch.keys()].filter((id) => !pa.has(id))
        : snap.topics.filter((t) => (t.flags & flagBit) !== 0 && !pa.has(t.id)).map((t) => t.id);
    roots[lens] = r.sort(byTitle);
  }

  const related = new Map<number, number[]>();
  for (const [a, b] of snap.edges.related) {
    push(related, a, b);
    push(related, b, a);
  }
  return { snap, byId, bySlug, children, parents, related, roots };
}

/** Ancestor chain (root first, excluding the topic itself). Prefers the given lens, then falls back. */
export function pathTo(idx: Index, id: number, lens: Lens): Topic[] {
  const order: Lens[] = [lens, ...(["ontology", "thematic", "parent"] as Lens[]).filter((l) => l !== lens)];
  const chain: Topic[] = [];
  const seen = new Set<number>([id]);
  let cur = id;
  for (let depth = 0; depth < 10; depth++) {
    let next: number | undefined;
    for (const l of order) {
      next = idx.parents[l].get(cur)?.find((p) => !seen.has(p));
      if (next !== undefined) break;
    }
    if (next === undefined) break;
    seen.add(next);
    const t = idx.byId.get(next);
    if (!t) break;
    chain.unshift(t);
    cur = next;
  }
  return chain;
}

export function pathLabel(idx: Index, id: number, lens: Lens = "ontology"): string {
  return pathTo(idx, id, lens)
    .map((t) => t.title)
    .join(" > ");
}

export function typeColor(type: string): string {
  const palette: Record<string, string> = {
    concept: "#6b7280",
    category: "#2563eb",
    object: "#a16207",
    place: "#15803d",
    animal: "#c2410c",
    prophet: "#7c3aed",
    person: "#9333ea",
    body_part: "#be123c",
    event: "#0e7490",
    plant: "#4d7c0f",
    angel: "#0284c7",
    religion: "#b45309",
    scripture: "#0f766e",
    jinn: "#475569",
  };
  return palette[type] ?? "#6b7280";
}
