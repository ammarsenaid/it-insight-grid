import { setState, logActivity, trashItem, uid, getState } from "./store";
import type {
  Document,
  DocStatus,
  Folder,
  DocumentRelations,
  DocumentVersion,
  DocType,
} from "./types";
import type { Role } from "../permissions";
import { can } from "../permissions";

// ---------- Folder helpers ----------

export function folderBreadcrumb(folderId: string | null, folders: Folder[]): string {
  if (!folderId) return "All Documents";
  const chain: string[] = [];
  let cur: Folder | undefined = folders.find((f) => f.id === folderId);
  while (cur) {
    chain.unshift(cur.name);
    cur = folders.find((f) => f.id === cur!.parentId) ?? undefined;
  }
  return chain.join(" / ") || "All Documents";
}

export function descendantFolderIds(folderId: string, folders: Folder[]): string[] {
  const out: string[] = [folderId];
  const stack = [folderId];
  while (stack.length) {
    const cur = stack.pop()!;
    folders.filter((f) => f.parentId === cur).forEach((f) => {
      out.push(f.id);
      stack.push(f.id);
    });
  }
  return out;
}

export function createFolder(name: string, parentId: string | null): Folder {
  const now = new Date().toISOString();
  const folder: Folder = { id: uid("fld"), name, parentId, createdAt: now, updatedAt: now };
  setState((s) => ({ ...s, folders: [...s.folders, folder] }));
  logActivity("folder.create", `Created folder '${name}'`);
  return folder;
}

export function renameFolder(id: string, name: string) {
  setState((s) => ({
    ...s,
    folders: s.folders.map((f) =>
      f.id === id ? { ...f, name, updatedAt: new Date().toISOString() } : f,
    ),
  }));
  logActivity("folder.rename", `Renamed folder to '${name}'`);
}

export function moveFolder(id: string, parentId: string | null) {
  // prevent moving into own descendant
  const descendants = descendantFolderIds(id, getState().folders);
  if (parentId && descendants.includes(parentId)) return false;
  setState((s) => ({
    ...s,
    folders: s.folders.map((f) =>
      f.id === id ? { ...f, parentId, updatedAt: new Date().toISOString() } : f,
    ),
  }));
  logActivity("folder.move", `Moved folder`);
  return true;
}

export function archiveFolder(id: string) {
  // archive all docs inside (and descendants)
  const state = getState();
  const ids = descendantFolderIds(id, state.folders);
  setState((s) => ({
    ...s,
    documents: s.documents.map((d) =>
      d.folderId && ids.includes(d.folderId)
        ? { ...d, status: "archived" as DocStatus, updatedAt: new Date().toISOString() }
        : d,
    ),
  }));
  logActivity("folder.archive", `Archived folder contents`);
}

export function deleteFolder(id: string) {
  const state = getState();
  const f = state.folders.find((x) => x.id === id);
  if (!f) return;
  const ids = descendantFolderIds(id, state.folders);
  trashItem("folder", f.name, folderBreadcrumb(f.parentId, state.folders), { folder: f, descendantIds: ids }, 0);
  setState((s) => ({
    ...s,
    folders: s.folders.filter((x) => !ids.includes(x.id)),
    documents: s.documents.map((d) =>
      d.folderId && ids.includes(d.folderId) ? { ...d, folderId: null } : d,
    ),
  }));
  logActivity("folder.delete", `Deleted folder '${f.name}'`);
}

// ---------- Document helpers ----------

const EMPTY_RELATIONS: DocumentRelations = {
  ticketIds: [],
  assetIds: [],
  ipamIds: [],
  taskIds: [],
  noteIds: [],
  userIds: [],
};

export function getRelations(doc: Document): DocumentRelations {
  if (doc.relations) return { ...EMPTY_RELATIONS, ...doc.relations };
  // Infer from tasks/notes if not stored
  const state = getState();
  const taskIds = state.tasks.filter((t) => t.linkedDocumentId === doc.id).map((t) => t.id);
  const noteIds = state.notes.filter((n) => n.linkedDocumentId === doc.id).map((n) => n.id);
  return { ...EMPTY_RELATIONS, taskIds, noteIds };
}

export function setRelations(docId: string, relations: DocumentRelations) {
  setState((s) => ({
    ...s,
    documents: s.documents.map((d) =>
      d.id === docId ? { ...d, relations, updatedAt: new Date().toISOString() } : d,
    ),
  }));
  logActivity("document.relations", `Updated relations`);
}

export function getVersions(doc: Document): DocumentVersion[] {
  if (doc.versions && doc.versions.length) return doc.versions;
  // Synthesize a small mock version history
  const base = parseFloat(doc.version || "1.0") || 1.0;
  const author = doc.owner || "system";
  const list: DocumentVersion[] = [];
  for (let i = 0; i < 3; i++) {
    const v = (base - i * 0.1).toFixed(1);
    const t = new Date(new Date(doc.updatedAt).getTime() - i * 7 * 86400000).toISOString();
    list.push({
      id: `${doc.id}_v${i}`,
      version: v,
      note: i === 0 ? "Current version" : i === 1 ? "Minor revisions" : "Initial publication",
      author,
      createdAt: t,
      size: Math.max(0, doc.size - i * 1024),
    });
  }
  return list;
}

export function addVersion(docId: string, version: string, note: string, author: string) {
  setState((s) => ({
    ...s,
    documents: s.documents.map((d) => {
      if (d.id !== docId) return d;
      const existing = getVersions(d);
      const next: DocumentVersion = {
        id: uid("ver"),
        version,
        note,
        author,
        createdAt: new Date().toISOString(),
        size: d.size,
      };
      return {
        ...d,
        version,
        versions: [next, ...existing],
        updatedAt: new Date().toISOString(),
      };
    }),
  }));
  logActivity("document.version", `Published v${version}`);
}

export function createDocument(input: Partial<Document>): Document {
  const now = new Date().toISOString();
  const doc: Document = {
    id: uid("doc"),
    name: input.name || input.title || "Untitled",
    extension: (input.extension as DocType) ?? "md",
    title: input.title || "Untitled",
    description: input.description ?? "",
    folderId: input.folderId ?? null,
    category: input.category ?? "General",
    status: input.status ?? "draft",
    importance: input.importance ?? "normal",
    owner: input.owner ?? "",
    tags: input.tags ?? [],
    content: input.content ?? "",
    size: (input.content?.length ?? 0) + 1024,
    version: input.version ?? "1.0",
    reviewDate: input.reviewDate,
    visibility: input.visibility ?? "internal",
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
  setState((s) => ({ ...s, documents: [doc, ...s.documents] }));
  logActivity("document.create", `Added document '${doc.title}'`);
  return doc;
}

export function updateDocument(id: string, patch: Partial<Document>) {
  setState((s) => ({
    ...s,
    documents: s.documents.map((d) =>
      d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d,
    ),
  }));
  logActivity("document.update", `Updated document`);
}

export function favoriteDocument(id: string) {
  setState((s) => ({
    ...s,
    documents: s.documents.map((d) => (d.id === id ? { ...d, favorite: !d.favorite } : d)),
  }));
}

export function renameDocument(id: string, title: string, name: string) {
  updateDocument(id, { title, name });
  logActivity("document.rename", `Renamed to '${title}'`);
}

export function moveDocument(id: string, folderId: string | null) {
  updateDocument(id, { folderId });
  logActivity("document.move", `Moved document`);
}

export function duplicateDocument(id: string): Document | null {
  const state = getState();
  const src = state.documents.find((d) => d.id === id);
  if (!src) return null;
  const now = new Date().toISOString();
  const copy: Document = {
    ...src,
    id: uid("doc"),
    title: src.title + " (copy)",
    name: src.name + " (copy)",
    status: "draft",
    version: "1.0",
    versions: undefined,
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
  setState((s) => ({ ...s, documents: [copy, ...s.documents] }));
  logActivity("document.duplicate", `Duplicated '${src.title}'`);
  return copy;
}

export function archiveDocument(id: string) {
  updateDocument(id, { status: "archived" });
  logActivity("document.archive", `Archived document`);
}

export function changeStatus(id: string, status: DocStatus) {
  updateDocument(id, { status });
  logActivity("document.status", `Status changed to ${status}`);
}

export function deleteDocument(id: string) {
  const state = getState();
  const d = state.documents.find((x) => x.id === id);
  if (!d) return;
  trashItem("document", d.title, folderBreadcrumb(d.folderId, state.folders), d, d.size);
  setState((s) => ({ ...s, documents: s.documents.filter((x) => x.id !== id) }));
  logActivity("document.delete", `Deleted '${d.title}'`);
}

export function bulkDelete(ids: string[]) {
  ids.forEach(deleteDocument);
}

export function bulkArchive(ids: string[]) {
  ids.forEach(archiveDocument);
}

export function bulkMove(ids: string[], folderId: string | null) {
  ids.forEach((id) => moveDocument(id, folderId));
}

export function bulkChangeStatus(ids: string[], status: DocStatus) {
  ids.forEach((id) => changeStatus(id, status));
}

export function downloadMock(doc: Document) {
  let mime = "text/plain";
  let body = doc.content || `Mock file: ${doc.name}\nGenerated locally — prototype only.`;
  if (doc.extension === "md") mime = "text/markdown";
  if (doc.extension === "image") {
    // a tiny valid 1x1 PNG (transparent)
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const url = URL.createObjectURL(new Blob([png], { type: "image/png" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.name}.png`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.name}.${doc.extension === "file" ? "txt" : doc.extension}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Permission-aware visibility ----------

export function isDocumentVisible(doc: Document, role: Role): boolean {
  const visibility = doc.visibility ?? "internal";
  // visibility gating
  if (visibility === "restricted" && !can("documents.view.restricted", role)) return false;
  // status gating: viewer/user only see approved status
  if (doc.status === "draft" && !can("documents.view.draft", role)) return false;
  if (doc.status === "review" && !can("documents.view.draft", role)) return false;
  if (doc.status === "archived" && !can("documents.view.archived", role)) return false;
  return true;
}

export function filterVisibleDocuments(docs: Document[], role: Role): Document[] {
  return docs.filter((d) => isDocumentVisible(d, role));
}

export type DocumentTab =
  | "all"
  | "favorites"
  | "recent"
  | "drafts"
  | "review"
  | "approved"
  | "archived";

export const DOC_TABS: { id: DocumentTab; label: string }[] = [
  { id: "all", label: "All Documents" },
  { id: "favorites", label: "Favorites" },
  { id: "recent", label: "Recent" },
  { id: "drafts", label: "Drafts" },
  { id: "review", label: "In Review" },
  { id: "approved", label: "Approved" },
  { id: "archived", label: "Archived" },
];

export function applyTabFilter(docs: Document[], tab: DocumentTab): Document[] {
  switch (tab) {
    case "favorites":
      return docs.filter((d) => d.favorite);
    case "recent":
      return [...docs].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 25);
    case "drafts":
      return docs.filter((d) => d.status === "draft");
    case "review":
      return docs.filter((d) => d.status === "review");
    case "approved":
      return docs.filter((d) => d.status === "approved");
    case "archived":
      return docs.filter((d) => d.status === "archived");
    case "all":
    default:
      return docs;
  }
}
