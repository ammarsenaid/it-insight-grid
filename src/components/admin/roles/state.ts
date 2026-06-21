import { useCallback, useEffect, useMemo, useState } from "react";

import { ROLES, type Role } from "@/lib/permissions";

import type { Density } from "./CommandBar";

export type TabKey = "roles" | "capabilities" | "pages" | "preview";
const TAB_KEYS: TabKey[] = ["roles", "capabilities", "pages", "preview"];

const DENSITY_STORAGE_KEY = "admin-roles:density";
const VIEW_STORAGE_KEY = "admin-roles:role-view";
const COLLAPSED_GROUPS_KEY = "admin-roles:collapsed-groups";

function isRole(value: string | null | undefined): value is Role {
  return Boolean(value) && ROLES.some((role) => role.id === value);
}

function isTab(value: string | null | undefined): value is TabKey {
  return TAB_KEYS.includes(value as TabKey);
}

export function useUrlState({
  defaultPreview,
  defaultTab,
}: {
  defaultPreview: Role;
  defaultTab: TabKey;
}) {
  const [tab, setTabState] = useState<TabKey>(() => readTab(defaultTab));
  const [preview, setPreviewState] = useState<Role>(() => readPreview(defaultPreview));

  useEffect(() => {
    function syncFromUrl() {
      setTabState(readTab(defaultTab));
      setPreviewState(readPreview(defaultPreview));
    }
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [defaultPreview, defaultTab]);

  const setTab = useCallback((next: TabKey) => {
    setTabState(next);
    writeSearch({ tab: next });
  }, []);

  const setPreview = useCallback((next: Role) => {
    setPreviewState(next);
    writeSearch({ as: next });
  }, []);

  return { tab, setTab, preview, setPreview };
}

function readTab(fallback: TabKey): TabKey {
  if (typeof window === "undefined") return fallback;
  const value = new URLSearchParams(window.location.search).get("tab");
  return isTab(value) ? value : fallback;
}

function readPreview(fallback: Role): Role {
  if (typeof window === "undefined") return fallback;
  const value = new URLSearchParams(window.location.search).get("as");
  return isRole(value) ? value : fallback;
}

function writeSearch(updates: Record<string, string | null>) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", next);
}

export function useDensity(): [Density, (next: Density) => void] {
  const [density, setDensity] = useState<Density>(() => {
    if (typeof window === "undefined") return "comfortable";
    const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return stored === "compact" ? "compact" : "comfortable";
  });

  const update = useCallback((next: Density) => {
    setDensity(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, next);
    }
  }, []);

  return [density, update];
}

export function useRoleListView(): ["table" | "grid", (next: "table" | "grid") => void] {
  const [view, setView] = useState<"table" | "grid">(() => {
    if (typeof window === "undefined") return "table";
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === "grid" ? "grid" : "table";
  });
  const update = useCallback((next: "table" | "grid") => {
    setView(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    }
  }, []);
  return [view, update];
}

export function useCollapsedGroups(): {
  collapsed: Set<string>;
  toggle: (group: string) => void;
  collapseAll: (groups: string[]) => void;
  expandAll: () => void;
} {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const stored = window.localStorage.getItem(COLLAPSED_GROUPS_KEY);
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set<string>();
    }
  });

  const persist = useCallback((next: Set<string>) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(Array.from(next)));
  }, []);

  return useMemo(
    () => ({
      collapsed,
      toggle: (group: string) =>
        setCollapsed((current) => {
          const next = new Set(current);
          if (next.has(group)) next.delete(group);
          else next.add(group);
          persist(next);
          return next;
        }),
      collapseAll: (groups: string[]) =>
        setCollapsed(() => {
          const next = new Set(groups);
          persist(next);
          return next;
        }),
      expandAll: () =>
        setCollapsed(() => {
          const next = new Set<string>();
          persist(next);
          return next;
        }),
    }),
    [collapsed, persist],
  );
}

export interface DensityClasses {
  rowPaddingY: string;
  cellSize: string;
  groupPaddingY: string;
}

export function densityClasses(density: Density): DensityClasses {
  return density === "compact"
    ? { rowPaddingY: "py-1.5", cellSize: "h-7 w-7", groupPaddingY: "py-1.5" }
    : { rowPaddingY: "py-2.5", cellSize: "h-8 w-8", groupPaddingY: "py-2" };
}
