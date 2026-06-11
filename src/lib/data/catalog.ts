import type { CatalogItem, CatalogItemStatus, CatalogField, TicketPriority } from "./types";
import { getState, setState, uid, logActivity, trashItem } from "./store";

export type CatalogItemInput = Omit<CatalogItem, "id" | "status" | "updatedAt"> & {
  status?: CatalogItemStatus;
};

export function createCatalogItem(input: CatalogItemInput): CatalogItem {
  const item: CatalogItem = {
    ...input,
    id: uid("cat"),
    status: input.status ?? "draft",
    updatedAt: new Date().toISOString(),
  };
  setState((s) => ({ ...s, catalog: [item, ...s.catalog] }));
  logActivity("catalog.create", `Created service "${item.name}"`, "catalog", item.id);
  return item;
}

export function updateCatalogItem(id: string, patch: Partial<Omit<CatalogItem, "id">>) {
  setState((s) => ({
    ...s,
    catalog: s.catalog.map((c) =>
      c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
    ),
  }));
  const c = getState().catalog.find((x) => x.id === id);
  if (c) logActivity("catalog.update", `Updated service "${c.name}"`, "catalog", id);
}

export function setCatalogStatus(id: string, status: CatalogItemStatus) {
  updateCatalogItem(id, { status });
  const c = getState().catalog.find((x) => x.id === id);
  if (c) logActivity(`catalog.${status}`, `Service "${c.name}" → ${status}`, "catalog", id);
}

export function publishCatalogItem(id: string)   { setCatalogStatus(id, "published"); }
export function unpublishCatalogItem(id: string) { setCatalogStatus(id, "draft"); }
export function archiveCatalogItem(id: string)   { setCatalogStatus(id, "archived"); }

export function deleteCatalogItem(id: string) {
  const c = getState().catalog.find((x) => x.id === id);
  if (!c) return;
  trashItem("note", `Service: ${c.name}`, "Service Catalog", c, 1024);
  setState((s) => ({ ...s, catalog: s.catalog.filter((x) => x.id !== id) }));
  logActivity("catalog.delete", `Deleted service "${c.name}"`, "catalog", id);
}

export const CATALOG_ICON_OPTIONS = [
  "Laptop", "KeyRound", "Package", "Globe", "UserPlus", "Mail", "Users",
  "Printer", "Tv", "ShieldAlert", "Wifi", "Server", "Monitor", "Phone",
  "Headphones", "HardDrive", "Lock", "Smartphone", "FileText", "Wrench",
] as const;

export const CATALOG_PRIORITIES: TicketPriority[] = ["low", "normal", "high", "critical"];

export function emptyCatalogField(): CatalogField {
  return { key: "", label: "", type: "text" };
}
