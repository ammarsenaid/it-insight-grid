import { useCallback, useEffect, useState } from "react";

const KEY = "kb:recent:v1";
const MAX = 8;

export interface RecentArticle {
  id: string;
  title: string;
  teamId: string;
  at: number;
}

function read(): RecentArticle[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as RecentArticle[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(items: RecentArticle[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    /* ignore quota */
  }
}

export function useRecentlyViewed(teamId: string | null) {
  const [items, setItems] = useState<RecentArticle[]>(() => read());

  useEffect(() => {
    setItems(read());
  }, [teamId]);

  const track = useCallback((entry: Omit<RecentArticle, "at">) => {
    const now = Date.now();
    const next = [{ ...entry, at: now }, ...read().filter((x) => x.id !== entry.id)].slice(0, MAX);
    write(next);
    setItems(next);
  }, []);

  const forget = useCallback((id: string) => {
    const next = read().filter((x) => x.id !== id);
    write(next);
    setItems(next);
  }, []);

  const filtered = teamId ? items.filter((x) => x.teamId === teamId) : items;
  return { items: filtered, track, forget };
}
