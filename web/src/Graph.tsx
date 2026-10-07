import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import { typeColor, type Index } from "./data";
import { childrenOf, parentsOf, relatedOf } from "./relations";
import { statusOf, type DraftFile } from "./store";

const MAX_CHILDREN = 16;

interface Props {
  idx: Index;
  topicId: number;
  lang: string | null;
  draft: DraftFile | undefined;
  onSelect: (id: number) => void;
}

/** Small map: parents above, the topic in the middle, sub-topics below, related topics dashed. */
export function Graph({ idx, topicId, lang, draft, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!ref.current) return;
    const nodes = new Map<string, Record<string, unknown>>();
    const edges: Record<string, unknown>[] = [];
    const add = (id: number, center = false) => {
      const t = idx.byId.get(id);
      if (!t || nodes.has(String(id))) return;
      nodes.set(String(id), {
        id: String(id),
        label: t.title.length > 26 ? t.title.slice(0, 25) + "..." : t.title,
        color: typeColor(t.type),
        size: 22 + Math.min(20, Math.log2(t.ayahs + 1) * 2.5),
        status: lang ? statusOf(t, lang, draft) : "none",
        center,
      });
    };

    add(topicId, true);
    for (const p of parentsOf(idx, topicId).slice(0, 6)) {
      add(p.id);
      edges.push({ id: `p${p.id}`, source: String(p.id), target: String(topicId), kind: "tree" });
    }
    const kids = childrenOf(idx, topicId);
    for (const c of kids.slice(0, MAX_CHILDREN)) {
      add(c.id);
      edges.push({ id: `c${c.id}`, source: String(topicId), target: String(c.id), kind: "tree" });
    }
    if (kids.length > MAX_CHILDREN) {
      nodes.set("more", { id: "more", label: `+${kids.length - MAX_CHILDREN} more`, color: "#e5e7eb", size: 22, status: "none", center: false });
      edges.push({ id: "more-e", source: String(topicId), target: "more", kind: "tree" });
    }
    for (const r of relatedOf(idx, topicId).slice(0, 8)) {
      add(r.id);
      edges.push({ id: `r${r.id}`, source: String(topicId), target: String(r.id), kind: "related" });
    }

    const cy = cytoscape({
      container: ref.current,
      elements: [...[...nodes.values()].map((data) => ({ data })), ...edges.map((data) => ({ data }))],
      layout: { name: "breadthfirst", directed: true, spacingFactor: 1.5, padding: 20 } as cytoscape.LayoutOptions,
      wheelSensitivity: 0.25,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "background-color": "data(color)",
            width: "data(size)",
            height: "data(size)",
            "font-size": 11,
            color: "#1f2937",
            "text-valign": "bottom",
            "text-margin-y": 4,
            "border-width": 3,
            "border-color": "#e5e7eb",
          },
        },
        { selector: 'node[status = "draft"]', style: { "border-color": "#16a34a" } },
        { selector: 'node[status = "app"]', style: { "border-color": "#2563eb" } },
        { selector: 'node[status = "stale"]', style: { "border-color": "#f59e0b" } },
        { selector: "node[?center]", style: { "border-width": 5, "font-weight": "bold", "font-size": 13 } },
        {
          selector: "edge",
          style: { width: 1.5, "line-color": "#cbd5e1", "target-arrow-color": "#cbd5e1", "target-arrow-shape": "triangle", "curve-style": "bezier" },
        },
        { selector: 'edge[kind = "related"]', style: { "line-style": "dashed", "target-arrow-shape": "none", "line-color": "#f472b6" } },
      ],
    });
    cy.on("tap", "node", (evt) => {
      const id = Number(evt.target.id());
      if (Number.isFinite(id) && id !== topicId) onSelectRef.current(id);
    });
    return () => cy.destroy();
  }, [idx, topicId, lang, draft]);

  return <div className="graph" ref={ref} />;
}
