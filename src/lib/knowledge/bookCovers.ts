import { useSyncExternalStore } from "react";

const KEY = "kb:book-covers:v1";

export type BookCover = { accent: string; icon: string };

const listeners = new Set<() => void>();

function read(): Record<string, BookCover> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

let cache: Record<string, BookCover> = read();

export function getBookCover(id: string): BookCover | undefined {
  return cache[id];
}

export function setBookCover(id: string, cover: BookCover): void {
  cache = { ...cache, [id]: cover };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function clearBookCover(id: string): void {
  const { [id]: _drop, ...rest } = cache;
  void _drop;
  cache = rest;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useBookCovers(): Record<string, BookCover> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => cache,
    () => ({}),
  );
}

export const COVER_ACCENTS = [
  "from-rose-500/80 to-orange-500/70",
  "from-emerald-500/80 to-teal-500/70",
  "from-indigo-500/80 to-violet-500/70",
  "from-sky-500/80 to-cyan-500/70",
  "from-amber-500/80 to-pink-500/70",
  "from-fuchsia-500/80 to-purple-500/70",
  "from-lime-500/80 to-emerald-500/70",
  "from-blue-500/80 to-indigo-500/70",
  "from-red-500/80 to-rose-500/70",
  "from-slate-500/80 to-zinc-500/70",
];

export const COVER_ICONS = [
  "book",
  "bookOpen",
  "bookMarked",
  "library",
  "compass",
  "sparkles",
  "lightbulb",
  "zap",
  "fileText",
  "star",
] as const;

export type CoverIconKey = (typeof COVER_ICONS)[number];
