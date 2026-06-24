import { useSyncExternalStore } from "react";

export type DepartmentMailbox = {
  id: string;
  enabled: boolean;
  department: string;
  displayName: string;
  address: string;
  replyTo: string;
  signature: string;
  syncMinutes: number;
  autoCreateTickets: boolean;
  notifyOnNew: boolean;
};

export type SharedMailboxState = {
  mailboxes: DepartmentMailbox[];
};

const KEY = "ikc.sharedMailbox.prefs.v2";
const LEGACY_KEY = "ikc.sharedMailbox.prefs.v1";

function newId() {
  return `mb_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
}

export function makeEmptyMailbox(overrides: Partial<DepartmentMailbox> = {}): DepartmentMailbox {
  return {
    id: newId(),
    enabled: false,
    department: "",
    displayName: "",
    address: "",
    replyTo: "",
    signature: "",
    syncMinutes: 5,
    autoCreateTickets: true,
    notifyOnNew: true,
    ...overrides,
  };
}

const DEFAULTS: SharedMailboxState = { mailboxes: [makeEmptyMailbox()] };

let state: SharedMailboxState = load();
const listeners = new Set<() => void>();

function load(): SharedMailboxState {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.mailboxes) && parsed.mailboxes.length > 0) {
        return {
          mailboxes: parsed.mailboxes.map((m: Partial<DepartmentMailbox>) => ({
            ...makeEmptyMailbox(),
            ...m,
            id: m.id ?? newId(),
          })),
        };
      }
    }
    // migrate from v1
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy);
      return { mailboxes: [{ ...makeEmptyMailbox(), ...old }] };
    }
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function addMailbox() {
  state = { mailboxes: [...state.mailboxes, makeEmptyMailbox({ enabled: true })] };
  persist();
}

export function removeMailbox(id: string) {
  state = { mailboxes: state.mailboxes.filter((m) => m.id !== id) };
  if (state.mailboxes.length === 0) state.mailboxes = [makeEmptyMailbox()];
  persist();
}

export function updateMailbox(id: string, patch: Partial<DepartmentMailbox>) {
  state = {
    mailboxes: state.mailboxes.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  };
  persist();
}

export function resetMailbox(id: string) {
  state = {
    mailboxes: state.mailboxes.map((m) =>
      m.id === id ? makeEmptyMailbox({ id: m.id }) : m,
    ),
  };
  persist();
}

export function useSharedMailboxState(): SharedMailboxState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => state,
    () => state,
  );
}
