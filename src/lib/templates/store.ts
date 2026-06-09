import { useSyncExternalStore } from "react";
import type { RegistryTemplate, TemplateState, TemplateType } from "./types";
import { buildBuiltinTemplates } from "./seed";

const KEY = "ikc.templates.v1";

const BUILTINS: RegistryTemplate[] = buildBuiltinTemplates();

const initialState: TemplateState = { custom: [], builtinUsage: {}, archivedBuiltinIds: [] };

let state: TemplateState = load();
const listeners = new Set<() => void>();

function load(): TemplateState {
  if (typeof window === "undefined") return initialState;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(initialState));
      return { ...initialState };
    }
    const parsed = JSON.parse(raw) as Partial<TemplateState>;
    return {
      custom: Array.isArray(parsed.custom) ? parsed.custom : [],
      builtinUsage: parsed.builtinUsage && typeof parsed.builtinUsage === "object" ? parsed.builtinUsage : {},
      archivedBuiltinIds: Array.isArray(parsed.archivedBuiltinIds) ? parsed.archivedBuiltinIds : [],
    };
  } catch {
    return { ...initialState };
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.error(e); }
}
function notify() { listeners.forEach((l) => l()); }
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function set(updater: (s: TemplateState) => TemplateState) {
  state = updater(state); persist(); notify();
}

export const tid = (p = "tpl") => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** Combined list: built-ins (with usage overrides + archived flag) + custom. */
function combined(s: TemplateState): RegistryTemplate[] {
  const archived = new Set(s.archivedBuiltinIds);
  const builtins = BUILTINS.map((b) => ({
    ...b,
    usageCount: s.builtinUsage[b.id] ?? b.usageCount,
    archived: archived.has(b.id),
  }));
  return [...builtins, ...s.custom];
}

export function useTemplates(): RegistryTemplate[] {
  return useSyncExternalStore(subscribe, () => combinedCached(state), () => combinedCached(state));
}

// memoize combined to keep referential stability per state object
let lastIn: TemplateState | null = null;
let lastOut: RegistryTemplate[] = [];
function combinedCached(s: TemplateState): RegistryTemplate[] {
  if (s === lastIn) return lastOut;
  lastIn = s; lastOut = combined(s);
  return lastOut;
}

export function getTemplates(): RegistryTemplate[] { return combinedCached(state); }

export function getTemplatesByType(type: TemplateType): RegistryTemplate[] {
  return getTemplates().filter((t) => t.type === type && !t.archived);
}

export function getTemplate(id: string): RegistryTemplate | null {
  return getTemplates().find((t) => t.id === id) ?? null;
}

/** Find by legacy source id (e.g. tpl_sop, tpl_patch_server) for backwards compat. */
export function getTemplateBySourceId(sourceId: string): RegistryTemplate | null {
  return getTemplates().find((t) => t.sourceId === sourceId) ?? null;
}

export function createTemplate(input: Omit<RegistryTemplate, "id" | "createdAt" | "updatedAt" | "usageCount" | "builtin">): RegistryTemplate {
  const now = new Date().toISOString();
  const t: RegistryTemplate = {
    ...input,
    id: tid(),
    builtin: false,
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  set((s) => ({ ...s, custom: [t, ...s.custom] }));
  return t;
}

export function updateTemplate(id: string, patch: Partial<RegistryTemplate>): boolean {
  const builtin = BUILTINS.find((b) => b.id === id);
  if (builtin) return false; // built-ins are read-only; duplicate to edit
  set((s) => ({
    ...s,
    custom: s.custom.map((t) => t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t),
  }));
  return true;
}

export function archiveTemplate(id: string) {
  const builtin = BUILTINS.find((b) => b.id === id);
  if (builtin) {
    set((s) => s.archivedBuiltinIds.includes(id) ? s : { ...s, archivedBuiltinIds: [...s.archivedBuiltinIds, id] });
    return;
  }
  set((s) => ({ ...s, custom: s.custom.map((t) => t.id === id ? { ...t, archived: true, updatedAt: new Date().toISOString() } : t) }));
}

export function restoreTemplate(id: string) {
  set((s) => ({
    ...s,
    archivedBuiltinIds: s.archivedBuiltinIds.filter((x) => x !== id),
    custom: s.custom.map((t) => t.id === id ? { ...t, archived: false, updatedAt: new Date().toISOString() } : t),
  }));
}

export function deleteTemplate(id: string): boolean {
  const builtin = BUILTINS.find((b) => b.id === id);
  if (builtin) return false;
  set((s) => ({ ...s, custom: s.custom.filter((t) => t.id !== id) }));
  return true;
}

export function duplicateTemplate(id: string): RegistryTemplate | null {
  const src = getTemplate(id);
  if (!src) return null;
  const { id: _, createdAt: __, updatedAt: ___, builtin: ____, usageCount: _____, sourceId: ______, ...rest } = src;
  return createTemplate({ ...rest, name: `${src.name} (Copy)`, status: "draft" });
}

export function incrementUsage(id: string) {
  const builtin = BUILTINS.find((b) => b.id === id);
  if (builtin) {
    set((s) => ({ ...s, builtinUsage: { ...s.builtinUsage, [id]: (s.builtinUsage[id] ?? builtin.usageCount) + 1 } }));
  } else {
    set((s) => ({ ...s, custom: s.custom.map((t) => t.id === id ? { ...t, usageCount: t.usageCount + 1 } : t) }));
  }
}

export function exportTemplate(id: string): string | null {
  const t = getTemplate(id);
  return t ? JSON.stringify(t, null, 2) : null;
}

export function importTemplate(json: string): RegistryTemplate | null {
  try {
    const parsed = JSON.parse(json) as Partial<RegistryTemplate>;
    if (!parsed.name || !parsed.type || !parsed.category) return null;
    return createTemplate({
      name: parsed.name,
      type: parsed.type,
      category: parsed.category,
      description: parsed.description ?? "",
      defaultTeam: parsed.defaultTeam,
      visibility: parsed.visibility ?? "internal",
      status: parsed.status ?? "draft",
      tags: parsed.tags ?? [],
      content: parsed.content,
      checklist: parsed.checklist,
      protocolSteps: parsed.protocolSteps,
      body: parsed.body,
    });
  } catch {
    return null;
  }
}
