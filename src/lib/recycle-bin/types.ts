export type RecycleBinKind = "asset" | "ipam" | "task" | "note";

export const RECYCLE_BIN_KINDS: RecycleBinKind[] = ["asset", "ipam", "task", "note"];

export const RECYCLE_BIN_KIND_LABELS: Record<RecycleBinKind, string> = {
  asset: "CMDB asset",
  ipam: "IPAM address",
  task: "Task",
  note: "Note",
};

export interface RecycleBinItem {
  id: string;
  kind: RecycleBinKind;
  name: string;
  originalLocation: string;
  deletedAt: string;
}
