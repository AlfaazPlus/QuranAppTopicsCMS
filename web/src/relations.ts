import type { Index, Lens, Topic } from "./data";

const LENS_ORDER: Lens[] = ["thematic", "ontology", "parent"];

function union(maps: Map<number, number[]>[], id: number): number[] {
  const seen = new Set<number>();
  for (const m of maps) for (const x of m.get(id) ?? []) seen.add(x);
  return [...seen];
}

/** Topics this topic sits under, across all hierarchies (deduplicated). */
export function parentsOf(idx: Index, id: number): Topic[] {
  return union(LENS_ORDER.map((l) => idx.parents[l]), id)
    .map((x) => idx.byId.get(x))
    .filter((t): t is Topic => !!t);
}

/** Sub-topics of this topic, across all hierarchies (deduplicated, by title). */
export function childrenOf(idx: Index, id: number): Topic[] {
  return union(LENS_ORDER.map((l) => idx.children[l]), id)
    .map((x) => idx.byId.get(x))
    .filter((t): t is Topic => !!t)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function relatedOf(idx: Index, id: number): Topic[] {
  return (idx.related.get(id) ?? []).map((x) => idx.byId.get(x)).filter((t): t is Topic => !!t);
}

/** One readable breadcrumb path from the top down to (not including) the topic. */
export function breadcrumb(idx: Index, id: number): Topic[] {
  const chain: Topic[] = [];
  const seen = new Set<number>([id]);
  let cur = id;
  for (let i = 0; i < 8; i++) {
    const next = parentsOf(idx, cur).find((p) => !seen.has(p.id));
    if (!next) break;
    seen.add(next.id);
    chain.unshift(next);
    cur = next.id;
  }
  return chain;
}

export const ROOT_GROUPS: { lens: Lens; title: string; blurb: string }[] = [
  { lens: "thematic", title: "Themes", blurb: "" },
  { lens: "ontology", title: "Kinds of things", blurb: "" },
  { lens: "parent", title: "Keyword index", blurb: "Phrases grouped under a keyword." },
];
