import type { ID, Note, NoteTemplate, Task } from "./types";
import { getState, setState, uid, logActivity, trashItem } from "./store";
import { createTask, CURRENT_USER } from "./tasks";

export const NOTE_CATEGORIES = [
  "General",
  "Network",
  "Security",
  "Backup",
  "M365",
  "Hardware",
  "Active Directory",
  "Virtualization",
];

export type NewNoteInput = Partial<Omit<Note, "id" | "createdAt" | "updatedAt">> & {
  title: string;
};

export function createNote(input: NewNoteInput): Note {
  const ts = new Date().toISOString();
  const note: Note = {
    id: uid("nte"),
    title: input.title.trim(),
    category: input.category ?? "General",
    content: input.content ?? "",
    tags: input.tags ?? [],
    pinned: input.pinned ?? false,
    archived: false,
    isTemplate: input.isTemplate ?? false,
    owner: input.owner ?? CURRENT_USER,
    linkedDocumentId: input.linkedDocumentId,
    linkedTicketIds: input.linkedTicketIds ?? [],
    linkedAssetIds: input.linkedAssetIds ?? [],
    linkedIpamIds: input.linkedIpamIds ?? [],
    linkedTaskIds: input.linkedTaskIds ?? [],
    linkedUserIds: input.linkedUserIds ?? [],
    createdAt: ts,
    updatedAt: ts,
  };
  setState((s) => ({ ...s, notes: [note, ...s.notes] }));
  logActivity("note.create", `Created note '${note.title}'`, "note", note.id);
  return note;
}

export function updateNote(id: ID, patch: Partial<Note>) {
  setState((s) => ({
    ...s,
    notes: s.notes.map((n) =>
      n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n,
    ),
  }));
  logActivity("note.update", `Updated note`, "note", id);
}

export function duplicateNote(id: ID): Note | null {
  const n = getState().notes.find((x) => x.id === id);
  if (!n) return null;
  return createNote({ ...n, title: n.title + " (copy)", pinned: false });
}

export function togglePin(id: ID) {
  setState((s) => ({
    ...s,
    notes: s.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)),
  }));
}

export function archiveNote(id: ID) {
  setState((s) => ({
    ...s,
    notes: s.notes.map((n) => (n.id === id ? { ...n, archived: true } : n)),
  }));
  logActivity("note.archive", `Archived note`, "note", id);
}

export function unarchiveNote(id: ID) {
  setState((s) => ({
    ...s,
    notes: s.notes.map((n) => (n.id === id ? { ...n, archived: false } : n)),
  }));
}

export function deleteNote(id: ID) {
  const n = getState().notes.find((x) => x.id === id);
  if (!n) return;
  trashItem("note", n.title, "Notes", n, n.content.length);
  setState((s) => ({ ...s, notes: s.notes.filter((x) => x.id !== id) }));
  logActivity("note.delete", `Deleted note '${n.title}'`, "note", id);
}

export function exportNoteMarkdown(n: Note) {
  const front = `---\ntitle: ${n.title}\ncategory: ${n.category}\ntags: ${(n.tags ?? []).join(", ")}\nupdated: ${n.updatedAt}\n---\n\n`;
  const blob = new Blob([front + n.content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${n.title.replace(/[^\w\- ]+/g, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function saveAsTemplate(n: Note): NoteTemplate {
  const tpl: NoteTemplate = {
    id: uid("ntpl"),
    name: n.title,
    category: n.category,
    content: n.content,
  };
  setState((s) => ({ ...s, noteTemplates: [tpl, ...s.noteTemplates] }));
  return tpl;
}

export function deleteTemplate(id: ID) {
  setState((s) => ({ ...s, noteTemplates: s.noteTemplates.filter((t) => t.id !== id) }));
}

// --- Conversions ---
export function convertNoteToDocument(n: Note) {
  const ts = new Date().toISOString();
  setState((s) => ({
    ...s,
    documents: [
      {
        id: uid("doc"),
        name: n.title,
        extension: "md",
        title: n.title,
        description: `Created from note '${n.title}'`,
        folderId: s.folders[0]?.id ?? null,
        category: n.category,
        status: "draft",
        importance: "normal",
        owner: n.owner ?? CURRENT_USER,
        tags: n.tags ?? [],
        content: n.content,
        size: n.content.length,
        version: "1.0",
        favorite: false,
        visibility: "internal",
        versions: [],
        relations: {
          ticketIds: n.linkedTicketIds ?? [],
          assetIds: n.linkedAssetIds ?? [],
          ipamIds: n.linkedIpamIds ?? [],
          taskIds: n.linkedTaskIds ?? [],
          noteIds: [n.id],
          userIds: n.linkedUserIds ?? [],
        },
        createdAt: ts,
        updatedAt: ts,
      },
      ...s.documents,
    ],
  }));
  logActivity("note.convert.document", `Converted note '${n.title}' to document`, "note", n.id);
}

export function convertNoteToTask(n: Note): Task {
  return createTask({
    title: n.title,
    description: n.content.slice(0, 280),
    category: n.category,
    priority: "normal",
    status: "open",
    scope: "personal",
    linkedNoteIds: [n.id],
    tags: ["from-note", ...(n.tags ?? [])],
  });
}
