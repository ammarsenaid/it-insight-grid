import { getSupabase } from "@/integrations/supabase/client";
import type {
  Note,
  NoteInput,
  NoteLinksInput,
  NoteTemplate,
  NoteTemplateInput,
} from "./types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mapNote(value: unknown): Note {
  const row = record(value);
  const links = record(row.links);
  return {
    id: text(row.id),
    title: text(row.title),
    category: text(row.category),
    content: text(row.content),
    tags: stringArray(row.tags),
    pinned: row.pinned === true,
    archived: row.archived === true,
    isTemplate: row.is_template === true,
    owner: text(row.owner),
    linkedDocumentId: nullableText(links.linkedDocumentId),
    linkedTicketIds: stringArray(links.linkedTicketIds),
    linkedAssetIds: stringArray(links.linkedAssetIds),
    linkedIpamIds: stringArray(links.linkedIpamIds),
    linkedTaskIds: stringArray(links.linkedTaskIds),
    linkedUserIds: stringArray(links.linkedUserIds),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    deletedAt: nullableText(row.deleted_at),
  };
}

function mapNoteTemplate(value: unknown): NoteTemplate {
  const row = record(value);
  return {
    id: text(row.id),
    name: text(row.name),
    category: text(row.category),
    content: text(row.content),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function notePayload(input: NoteInput): Record<string, unknown> {
  return {
    title: input.title,
    category: input.category,
    content: input.content,
    tags: input.tags,
    pinned: input.pinned,
    isTemplate: input.isTemplate,
    linkedDocumentId: input.linkedDocumentId,
  };
}

function noteTemplatePayload(input: NoteTemplateInput): Record<string, unknown> {
  return {
    name: input.name,
    category: input.category,
    content: input.content,
  };
}

export async function listNotes(includeDeleted = false): Promise<Note[]> {
  const { data, error } = await getSupabase().rpc("list_notes", { p_include_deleted: includeDeleted });
  if (error) throw error;
  return (data ?? []).map(mapNote);
}

export async function listNoteTemplates(): Promise<NoteTemplate[]> {
  const { data, error } = await getSupabase().rpc("list_note_templates");
  if (error) throw error;
  return (data ?? []).map(mapNoteTemplate);
}

export async function saveNote(id: string | null, input: NoteInput): Promise<string> {
  const { data, error } = await getSupabase().rpc("save_note", {
    p_note_id: id,
    p_input: notePayload(input),
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function saveNoteTemplate(id: string | null, input: NoteTemplateInput): Promise<string> {
  const { data, error } = await getSupabase().rpc("save_note_template", {
    p_template_id: id,
    p_input: noteTemplatePayload(input),
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function toggleNotePin(id: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc("toggle_note_pin", { p_note_id: id });
  if (error) throw error;
  return data === true;
}

export async function setNoteArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await getSupabase().rpc("set_note_archived", { p_note_id: id, p_archived: archived });
  if (error) throw error;
}

export async function duplicateNote(id: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("duplicate_note", { p_note_id: id });
  if (error) throw error;
  return String(data ?? "");
}

export async function saveNoteLinks(id: string, links: NoteLinksInput): Promise<void> {
  const { error } = await getSupabase().rpc("save_note_links", {
    p_note_id: id,
    p_links: links as unknown as Record<string, unknown>,
  });
  if (error) throw error;
}

export async function softDeleteNote(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("soft_delete_note", { p_note_id: id });
  if (error) throw error;
}

export async function restoreNote(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("restore_note", { p_note_id: id });
  if (error) throw error;
}

export async function softDeleteNoteTemplate(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("soft_delete_note_template", { p_template_id: id });
  if (error) throw error;
}

export async function restoreNoteTemplate(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("restore_note_template", { p_template_id: id });
  if (error) throw error;
}

export function publicNoteError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  if (["22P02", "22023", "23514"].includes(code)) return "One or more note values are invalid.";
  if (code === "42501") return "You do not have permission to manage notes.";
  if (code === "P0002") return "That note could not be found. It may have been deleted.";
  return "The note operation failed. Try again or contact an administrator.";
}
