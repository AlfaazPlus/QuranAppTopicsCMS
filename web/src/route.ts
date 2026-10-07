import { useCallback, useEffect, useState } from "react";

export interface Route {
  page: "explore" | "translate" | "help";
  params: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const page = path === "translate" || path === "help" ? path : "explore";
  return { page, params: new URLSearchParams(query) };
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const h = () => setRoute(parse());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  const go = useCallback((page: Route["page"], params: Record<string, string | undefined> = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const s = q.toString();
    window.location.hash = `/${page}${s ? `?${s}` : ""}`;
  }, []);
  return { route, go };
}
