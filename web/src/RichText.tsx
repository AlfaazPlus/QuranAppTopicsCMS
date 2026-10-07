import { Fragment, type ReactNode } from "react";
import { useStore } from "./store";

// The English text in topics.db contains a small set of markup tags:
//   <b>..</b>   bold            <ar>..</ar>  Arabic text
//   <topic id="N">..</topic>    link to another topic
//   <reference chapter="C" verses="V">..</reference>   Quran reference
// Rendered with React elements (never innerHTML), so unknown markup stays inert text.

const TAG_RE = /<(\/?)(b|ar|topic|reference)((?:\s+[a-z]+="[^"]*")*)\s*>/gi;

interface Node {
  tag: string;
  attrs: Record<string, string>;
  children: (string | Node)[];
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([a-z]+)="([^"]*)"/gi)) out[m[1].toLowerCase()] = m[2];
  return out;
}

export function parseRich(text: string): Node {
  const root: Node = { tag: "root", attrs: {}, children: [] };
  const stack: Node[] = [root];
  let last = 0;
  for (const m of text.matchAll(TAG_RE)) {
    const top = stack[stack.length - 1];
    if (m.index! > last) top.children.push(text.slice(last, m.index));
    last = m.index! + m[0].length;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (!closing) {
      const node: Node = { tag, attrs: parseAttrs(m[3] ?? ""), children: [] };
      top.children.push(node);
      stack.push(node);
    } else {
      // Close the nearest matching open tag; ignore stray closers.
      const at = stack.map((n) => n.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
    }
  }
  if (last < text.length) stack[stack.length - 1].children.push(text.slice(last));
  return root;
}

/** Strip markup, e.g. for places that need plain text. */
export function plainText(text: string): string {
  return text.replace(TAG_RE, "");
}

export function RichText({ text, onTopic }: { text: string; onTopic?: (slug: string) => void }) {
  const { idx } = useStore();

  const render = (n: Node | string, key: number): ReactNode => {
    if (typeof n === "string") return <Fragment key={key}>{n}</Fragment>;
    const kids = n.children.map(render);
    switch (n.tag) {
      case "root":
        return <Fragment key={key}>{kids}</Fragment>;
      case "b":
        return <strong key={key}>{kids}</strong>;
      case "ar":
        return (
          <span key={key} className="rt-ar" dir="rtl" lang="ar">
            {kids}
          </span>
        );
      case "topic": {
        const target = idx.byId.get(Number(n.attrs.id));
        const slug = target?.slug;
        const title = target ? `Topic: ${target.title}` : "Related topic";
        return onTopic && slug ? (
          <button key={key} className="rt-topic link" title={title} onClick={() => onTopic(slug)}>
            {kids}
          </button>
        ) : (
          <span key={key} className="rt-topic" title={title}>
            {kids}
          </span>
        );
      }
      case "reference": {
        const { chapter, verses } = n.attrs;
        const title = chapter ? `Quran ${chapter}${verses ? `:${verses}` : ""}` : "Quran reference";
        return (
          <span key={key} className="rt-ref" title={title}>
            {kids}
          </span>
        );
      }
      default:
        return <Fragment key={key}>{kids}</Fragment>;
    }
  };

  return <>{render(parseRich(text), 0)}</>;
}
