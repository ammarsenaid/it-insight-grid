// Knowledge-article attachment client API.
//
// Storage layout (must match storage RLS policies in batch 004):
//   bucket : knowledge-attachments  (private)
//   key    : {team_id}/{article_id}/{attachment_id}-{safe_file_name}
//
// The pointer row in public.knowledge_attachments is the authoritative
// record. Storage objects are reachable only via signed URLs.

import { getSupabase } from "@/integrations/supabase/client";

export const ATTACHMENTS_BUCKET = "knowledge-attachments";
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MiB
export const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 minutes

/**
 * Conservative MIME allowlist. The same allowlist is enforced
 * server-side by a CHECK constraint on `knowledge_attachments.mime_type`
 * (migration 20260610011000_harden_knowledge_attachments.sql) and SHOULD
 * also be configured on the private storage bucket
 * (`allowed_mime_types`) so rejected uploads fail fast.
 */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type AllowedAttachmentMime = typeof ALLOWED_ATTACHMENT_MIME_TYPES[number];

export function isAllowedMime(mime: string): mime is AllowedAttachmentMime {
  return (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime);
}

export interface KbAttachment {
  id: string;
  article_id: string;
  team_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

type Result<T> = { data: T | null; error: string | null };

function msg(action: string, err: unknown): string {
  const detail =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
  console.error(`[knowledge-attachments] ${action} failed`, err);
  return `${action} failed: ${detail}`;
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  const trimmed = cleaned.slice(0, 200);
  return trimmed || "file";
}

function newUuid(): string {
  // Browser crypto is available in the runtime we target.
  return crypto.randomUUID();
}

export async function listAttachments(articleId: string): Promise<Result<KbAttachment[]>> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("knowledge_attachments")
      .select("id, article_id, team_id, storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at")
      .eq("article_id", articleId)
      .order("created_at", { ascending: false });
    if (error) return { data: null, error: msg("Load attachments", error) };
    return { data: (data ?? []) as KbAttachment[], error: null };
  } catch (e) {
    return { data: null, error: msg("Load attachments", e) };
  }
}

export async function uploadAttachment(input: {
  teamId: string;
  articleId: string;
  file: File;
}): Promise<Result<KbAttachment>> {
  try {
    if (input.file.size > MAX_ATTACHMENT_BYTES) {
      return { data: null, error: `File exceeds the ${(MAX_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0)} MB limit.` };
    }
    if (input.file.size === 0) {
      return { data: null, error: "Empty files are not allowed." };
    }

    const sb = getSupabase();
    const { data: userRes } = await sb.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return { data: null, error: "Upload failed: not signed in." };

    const id = newUuid();
    const fname = safeFileName(input.file.name);
    const path = `${input.teamId}/${input.articleId}/${id}-${fname}`;
    const mime = input.file.type || "application/octet-stream";

    const up = await sb.storage.from(ATTACHMENTS_BUCKET).upload(path, input.file, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    });
    if (up.error) return { data: null, error: msg("Upload object", up.error) };

    const { data, error } = await sb
      .from("knowledge_attachments")
      .insert({
        id,
        article_id: input.articleId,
        team_id: input.teamId,
        storage_path: path,
        file_name: input.file.name.trim().slice(0, 255) || fname,
        mime_type: mime,
        size_bytes: input.file.size,
        uploaded_by: uid,
      })
      .select("id, article_id, team_id, storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at")
      .single();

    if (error) {
      // Roll back the orphan object so storage doesn't drift from pointers.
      await sb.storage.from(ATTACHMENTS_BUCKET).remove([path]).catch(() => undefined);
      return { data: null, error: msg("Save attachment record", error) };
    }
    return { data: data as KbAttachment, error: null };
  } catch (e) {
    return { data: null, error: msg("Upload attachment", e) };
  }
}

export async function deleteAttachment(att: Pick<KbAttachment, "id" | "storage_path">): Promise<Result<true>> {
  try {
    const sb = getSupabase();
    const { error } = await sb.from("knowledge_attachments").delete().eq("id", att.id);
    if (error) return { data: null, error: msg("Delete attachment", error) };
    // Best-effort object removal; if RLS denies it (e.g. permission change
    // mid-flight) the pointer row is already gone and a future janitor can
    // sweep the orphan.
    await sb.storage.from(ATTACHMENTS_BUCKET).remove([att.storage_path]).catch(() => undefined);
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: msg("Delete attachment", e) };
  }
}

export async function getAttachmentDownloadUrl(path: string): Promise<Result<string>> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: true });
    if (error || !data?.signedUrl) return { data: null, error: msg("Generate download link", error) };
    return { data: data.signedUrl, error: null };
  } catch (e) {
    return { data: null, error: msg("Generate download link", e) };
  }
}
