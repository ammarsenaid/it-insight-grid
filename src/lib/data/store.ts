import { useSyncExternalStore } from "react";
import type { DataState, ActivityLog, TrashItem, TrashKind, AppSettings } from "./types";
import { buildSeed } from "./seed";

const KEY = "ikc.data.v1";

let state: DataState = load();
const listeners = new Set<() => void>();

function load(): DataState {
  if (typeof window === "undefined") return buildSeed();
  try {
    const seeded = buildSeed();
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as Partial<DataState>;
    // Merge in any new top-level keys added by later batches (forward-compat)
    const merged: DataState = { ...seeded, ...parsed } as DataState;
    if (!Array.isArray(merged.tickets)) merged.tickets = seeded.tickets;
    if (!Array.isArray(merged.ticketViews)) merged.ticketViews = seeded.ticketViews;
    if (!Array.isArray(merged.catalog)) merged.catalog = seeded.catalog;
    if (!merged.ticketSettings) merged.ticketSettings = seeded.ticketSettings;
    if (!Array.isArray(merged.taskViews)) merged.taskViews = seeded.taskViews;
    if (!Array.isArray(merged.noteTemplates)) merged.noteTemplates = seeded.noteTemplates;
    if (!Array.isArray(merged.users)) merged.users = seeded.users;
    if (!Array.isArray(merged.teams)) merged.teams = seeded.teams;
    return merged;
  } catch {
    return buildSeed();
  }
}

function persist() {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Persist failed", e);
    }
  }
}

function notify() {
  listeners.forEach((l) => l());
}

export function setState(updater: (s: DataState) => DataState) {
  state = updater(state);
  persist();
  notify();
}

export function getState(): DataState {
  return state;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useData(): DataState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function useSlice<T>(selector: (s: DataState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

export const uid = (p: string) =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function logActivity(type: string, message: string, entityType?: string, entityId?: string) {
  const entry: ActivityLog = {
    id: uid("act"),
    type,
    message,
    entityType,
    entityId,
    createdAt: new Date().toISOString(),
  };
  setState((s) => ({ ...s, activity: [entry, ...s.activity].slice(0, 200) }));
}

export function trashItem(kind: TrashKind, name: string, originalLocation: string, payload: unknown, size = 1024) {
  const item: TrashItem = {
    id: uid("trh"),
    kind,
    name,
    originalLocation,
    payload,
    size,
    deletedAt: new Date().toISOString(),
  };
  setState((s) => ({ ...s, trash: [item, ...s.trash] }));
}

export function resetDemo() {
  state = buildSeed();
  persist();
  notify();
}

export function clearAll() {
  state = {
    ...buildSeed(),
    folders: [],
    documents: [],
    assets: [],
    ipam: [],
    tasks: [],
    taskViews: [],
    notes: [],
    noteTemplates: [],
    tickets: [],
    ticketViews: [],
    trash: [],
    activity: [],
    snapshots: [],
    notifications: [],
  };
  persist();
  notify();
}

export function exportJSON(): string {
  return JSON.stringify(state, null, 2);
}

export function importJSON(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as DataState;
    if (!parsed.settings) return false;
    state = parsed;
    persist();
    notify();
    return true;
  } catch {
    return false;
  }
}

export function updateSettings(partial: Partial<AppSettings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...partial } }));
}

export function refreshFromStorage() {
  state = load();
  notify();
}
