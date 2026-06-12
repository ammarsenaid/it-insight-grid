/**
 * Service Desk — Ticket attachments.
 *
 * Files live in the private `ticket-attachments` storage bucket.
 * Storage paths follow `<ticket_uuid>/<unique_filename>` to satisfy
 * the migration's path validator and storage RLS.
 *
 * Reads use createSignedUrl so the browser never needs a public URL.
 */
import { getSupabase } from "@/integrations/supabase/client";
import { mapAttachment } from "./mappers";
import { asRow, asRows, type SbRow } from "./sb";
import type { TicketAttachment } from "./types";

const BUCKET = "ticket-attachments";
const COLS =
  "id, ticket_id, comment_id, uploaded_by, storage_path, file_name, mime_type, size_bytes, visibility, created_at";

const MAX_SIZE = 50 * 1024 * 1024; // mirrors the CHECK constraint

export async function listTicketAttachments(ticketId: string): Promise<TicketAttachment[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_attachments")
    .select(COLS)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return asRows<SbRow>(data).map(mapAttachment);
}

function safeFilename(name: string): string {
  // Strip path separators and control chars; cap length.
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[\u0000-\u001f]/g, "_").slice(0, 200);
}

export interface UploadAttachmentInput {
  ticketId: string;
  uploadedBy: string;
  file: File;
  commentId?: string | null;
  visibility?: "public" | "internal";
}

export async function uploadTicketAttachment(
  input: UploadAttachmentInput,
): Promise<TicketAttachment> {
  if (input.file.size > MAX_SIZE) {
    throw new Error(`File too large (max ${MAX_SIZE / 1024 / 1024} MB).`);
  }
  const sb = getSupabase();
  const cleanName = safeFilename(input.file.name);
  const storagePath = `${input.ticketId}/${Date.now()}-${cleanName}`;

  const up = await sb.storage.from(BUCKET).upload(storagePath, input.file, {
    cacheControl: "3600",
    upsert: false,
    contentType: input.file.type || undefined,
  });
  if (up.error) throw up.error;

  const { data, error } = await sb
    .from("ticket_attachments")
    .insert({
      ticket_id: input.ticketId,
      comment_id: input.commentId ?? null,
      uploaded_by: input.uploadedBy,
      storage_path: storagePath,
      file_name: cleanName,
      mime_type: input.file.type || "application/octet-stream",
      size_bytes: input.file.size,
      visibility: input.visibility ?? "public",
    })
    .select(COLS)
    .single();
  if (error) {
    // Best-effort cleanup if metadata insert fails (storage object orphan).
    await sb.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw error;
  }
  return mapAttachment(asRow<SbRow>(data));
}

/** Returns a short-lived signed URL the browser can use to download. */
export async function getAttachmentSignedUrl(
  storagePath: string,
  expiresInSeconds = 300,
): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteTicketAttachment(attachment: TicketAttachment): Promise<void> {
  const sb = getSupabase();
  // Keep metadata available when storage deletion fails so the user can retry.
  const storageDelete = await sb.storage.from(BUCKET).remove([attachment.storagePath]);
  if (storageDelete.error) throw storageDelete.error;

  const { error } = await sb.from("ticket_attachments").delete().eq("id", attachment.id);
  if (error) throw error;
}
