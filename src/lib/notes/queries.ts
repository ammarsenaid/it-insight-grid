import { queryOptions } from "@tanstack/react-query";
import { listNotes, listNoteTemplates } from "./notes";

export const notesKeys = {
  all: ["notes"] as const,
  list: (includeDeleted: boolean) => [...notesKeys.all, "list", { includeDeleted }] as const,
};

export const notesQuery = (includeDeleted = false) => queryOptions({
  queryKey: notesKeys.list(includeDeleted),
  queryFn: () => listNotes(includeDeleted),
});

export const noteTemplatesKeys = {
  all: ["noteTemplates"] as const,
  list: () => [...noteTemplatesKeys.all, "list"] as const,
};

export const noteTemplatesQuery = () => queryOptions({
  queryKey: noteTemplatesKeys.list(),
  queryFn: () => listNoteTemplates(),
});
