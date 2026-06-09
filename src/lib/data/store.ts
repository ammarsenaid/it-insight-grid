import { useSyncExternalStore } from "react";
import type { DataState, ActivityLog, TrashItem, TrashKind, AppSettings } from "./types";
import { buildSeed } from "./seed";

const KEY = "ikc.data.v1";
const SCHEMA_VERSION_KEY = "ikc.frontend.schemaVersion";
const CURRENT_SCHEMA = 2;

let state: DataState = load();
const listeners = new Set<() => void>();

/**
 * Versioned migration. Runs once per schema bump.
 * v2: Removes obsolete legacy file-record documents/folders and their
 *     recycle-bin entries. Preserves tickets, CMDB, IPAM, tasks, notes,
 *     users, teams, audit, settings, snapshots and notifications.
 */
function migrate(parsed: Partial<DataState>): Partial<DataState> {
  if (typeof window === "undefined") return parsed;
  const stored = Number(localStorage.getItem(SCHEMA_VERSION_KEY) ?? "1");
  if (stored < 2) {
    parsed.folders = [];
    parsed.documents = [];
    if (Array.isArray(parsed.trash)) {
      parsed.trash = parsed.trash.filter(
        (t) => t.kind !== "document" && t.kind !== "folder",
      );
    }
    if (Array.isArray(parsed.activity)) {
      parsed.activity = parsed.activity.filter(
        (a) => !a.type?.startsWith("document.") && !a.type?.startsWith("folder."),
      );
    }
    localStorage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA));
  }
  return parsed;
}

function load(): DataState {
  if (typeof window === "undefined") return buildSeed();
  try {
    const seeded = buildSeed();
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA));
      localStorage.setItem(KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = migrate(JSON.parse(raw) as Partial<DataState>);
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
    // Persist migrated state so legacy entries don't reappear.
    localStorage.setItem(KEY, JSON.stringify(merged));
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

export function logActivity(type: string, message: string, entityType?: string, entityId?: string, actor?: string) {
  const moduleFromType = type.split(".")[0];
  const entry: ActivityLog = {
    id: uid("act"),
    type,
    message,
    actor,
    module: moduleFromType,
    entityType,
    entityId,
    createdAt: new Date().toISOString(),
  };
  setState((s) => ({ ...s, activity: [entry, ...s.activity].slice(0, 500) }));
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
    users: [],
    teams: [],
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
