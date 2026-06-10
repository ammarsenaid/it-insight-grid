import { useSyncExternalStore } from "react";

export type DashboardSection =
  // Default-enabled (control center)
  | "attentionRequired"
  | "myWork"
  | "quickActions"
  | "alerts"
  | "activity"
  | "operationalOverview"
  | "ticketsChart"
  // Default-disabled (optional)
  | "knowledgeMetrics"
  | "infrastructureMetrics"
  | "docsChart"
  | "recentKnowledge"
  | "recycleBinSummary";

export type DashboardPrefs = Record<DashboardSection, boolean>;

const DEFAULTS: DashboardPrefs = {
  attentionRequired: true,
  myWork: true,
  quickActions: true,
  alerts: true,
  activity: true,
  operationalOverview: true,
  ticketsChart: true,
  knowledgeMetrics: false,
  infrastructureMetrics: false,
  docsChart: false,
  recentKnowledge: false,
  recycleBinSummary: false,
};

const KEY = "ikc.dashboard.prefs.v2";
const PENDING_KEY = "ikc.tickets.pendingFilters";

let prefs: DashboardPrefs = load();
const listeners = new Set<() => void>();

function load(): DashboardPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function persist() {
  if (typeof window !== "undefined") {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  }
}

export function setDashboardPref(section: DashboardSection, value: boolean) {
  prefs = { ...prefs, [section]: value };
  persist();
  listeners.forEach((l) => l());
}

export function resetDashboardPrefs() {
  prefs = { ...DEFAULTS };
  persist();
  listeners.forEach((l) => l());
}

export function useDashboardPrefs(): DashboardPrefs {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => prefs,
    () => prefs,
  );
}

// Handoff filters from dashboard → /tickets without route param surgery
export type PendingTicketFilters = Partial<{
  status: string;
  sla: string;
  assignee: string;
  scope: "mine" | "unassigned" | "resolvedToday" | "waiting" | "dueToday";
}>;

export function setPendingTicketFilters(f: PendingTicketFilters) {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

export function consumePendingTicketFilters(): PendingTicketFilters | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
