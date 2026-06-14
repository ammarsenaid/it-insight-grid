import type { Task } from "./types";
import { uid, logActivity, setState } from "./store";
import { createTask, CURRENT_USER } from "./tasks";
import type { Note } from "@/lib/notes/types";

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

// --- Conversions ---
// These create records in the Documents and Tasks browser-local stores.
// Documents are not yet backend-authoritative; the Tasks conversion mirrors
// prior milestones, which left cross-module record creation on the local
// seed store outside the migrated module's scope.
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
        owner: n.owner || CURRENT_USER,
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
