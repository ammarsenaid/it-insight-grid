// Knowledge-base review workflow helpers.
//
// Each workflow action updates the article's status AND inserts an
// immutable knowledge_review_events row. RLS is the authoritative gate;
// callers should also rely on useKnowledgePermissions to hide affordances.

import { getSupabase } from "@/integrations/supabase/client";
import type { ArticleStatus, KbArticle } from "./backend-types";
import { updateArticle } from "./mutations";

export type ReviewAction =
  | "submit"
  | "approve"
  | "request_changes"
  | "publish"
  | "withdraw";

export interface KbReviewEvent {
  id: string;
  article_id: string;
  team_id: string;
  action: ReviewAction;
  from_status: string;
  to_status: string;
  comment: string | null;
  actor_id: string | null;
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
  console.error(`[knowledge-review] ${action} failed`, err);
  return `${action} failed: ${detail}`;
}

async function recordEvent(input: {
  article: Pick<KbArticle, "id" | "team_id">;
  action: ReviewAction;
  fromStatus: ArticleStatus | string;
  toStatus: ArticleStatus | string;
  comment?: string | null;
}): Promise<Result<true>> {
  try {
    const sb = getSupabase();
    const { data: userRes } = await sb.auth.getUser();
    const uid = userRes.user?.id ?? null;
    if (!uid) return { data: null, error: "Record review event failed: not signed in." };
    const { error } = await sb.from("knowledge_review_events").insert({
      article_id: input.article.id,
      team_id: input.article.team_id,
      action: input.action,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      comment: input.comment?.trim() || null,
      actor_id: uid,
    });
    if (error) return { data: null, error: msg("Record review event", error) };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: msg("Record review event", e) };
  }
}

async function transition(
  article: KbArticle,
  action: ReviewAction,
  toStatus: ArticleStatus,
  comment?: string | null,
): Promise<Result<KbArticle>> {
  const updated = await updateArticle({ id: article.id, status: toStatus });
  if (updated.error || !updated.data) return updated;
  const ev = await recordEvent({
    article,
    action,
    fromStatus: article.status,
    toStatus,
    comment,
  });
  if (ev.error) {
    // The status change already succeeded; surface the audit failure
    // separately so the caller can show a non-blocking warning.
    return { data: updated.data, error: ev.error };
  }
  return updated;
}

export function submitForReview(article: KbArticle, comment?: string | null) {
  return transition(article, "submit", "in_review", comment);
}

export function withdrawFromReview(article: KbArticle, comment?: string | null) {
  return transition(article, "withdraw", "draft", comment);
}

export function approveForPublication(article: KbArticle, comment?: string | null) {
  return transition(article, "approve", "approved", comment);
}

export function requestChanges(article: KbArticle, comment: string) {
  return transition(article, "request_changes", "draft", comment);
}

export function publishApproved(article: KbArticle, comment?: string | null) {
  return transition(article, "publish", "published", comment);
}

export async function fetchReviewEvents(
  articleId: string,
  teamId: string,
): Promise<Result<KbReviewEvent[]>> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("knowledge_review_events")
      .select("id, article_id, team_id, action, from_status, to_status, comment, actor_id, created_at")
      .eq("article_id", articleId)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    if (error) return { data: null, error: msg("Load review history", error) };
    return { data: (data ?? []) as KbReviewEvent[], error: null };
  } catch (e) {
    return { data: null, error: msg("Load review history", e) };
  }
}
