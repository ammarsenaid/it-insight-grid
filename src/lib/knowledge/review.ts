// Knowledge-base review workflow client.
//
// RC1.1: all status transitions go through the
// `knowledge_transition_article_status` RPC, which performs the
// status update and the immutable review-event insert in a single
// database transaction. The browser never touches
// `knowledge_articles.status` directly — a BEFORE UPDATE trigger
// rejects any client-side status change.

import { getSupabase } from "@/integrations/supabase/client";
import type { KbArticle } from "./backend-types";

export type ReviewAction =
  | "submit"
  | "approve"
  | "request_changes"
  | "publish"
  | "withdraw"
  | "archive"
  | "restore";

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

const ACTION_USER_MESSAGE: Record<ReviewAction, string> = {
  submit: "Could not submit the article for review.",
  approve: "Could not approve the article.",
  request_changes: "Could not request changes.",
  publish: "Could not publish the article.",
  withdraw: "Could not withdraw the article.",
  archive: "Could not archive the article.",
  restore: "Could not restore the article.",
};

function safeError(action: ReviewAction, err: unknown): string {
  // Log the raw technical detail only to the browser console.
  console.error(`[knowledge-review] ${action} failed`, err);
  return ACTION_USER_MESSAGE[action];
}

async function transition(
  article: Pick<KbArticle, "id">,
  action: ReviewAction,
  comment?: string | null,
): Promise<Result<KbArticle>> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("knowledge_transition_article_status", {
      requested_article_id: article.id,
      requested_action: action,
      requested_comment: comment?.toString().trim() || null,
    });
    if (error) return { data: null, error: safeError(action, error) };
    // RPC returns a single row of knowledge_articles.
    const row = Array.isArray(data) ? data[0] : data;
    return { data: (row as KbArticle) ?? null, error: null };
  } catch (e) {
    return { data: null, error: safeError(action, e) };
  }
}

export const submitForReview = (a: Pick<KbArticle, "id">, c?: string | null) => transition(a, "submit", c);
export const withdrawFromReview = (a: Pick<KbArticle, "id">, c?: string | null) => transition(a, "withdraw", c);
export const approveForPublication = (a: Pick<KbArticle, "id">, c?: string | null) => transition(a, "approve", c);
export const requestChanges = (a: Pick<KbArticle, "id">, c: string) => transition(a, "request_changes", c);
export const publishApproved = (a: Pick<KbArticle, "id">, c?: string | null) => transition(a, "publish", c);
export const archiveArticle = (a: Pick<KbArticle, "id">, c?: string | null) => transition(a, "archive", c);
export const restoreArticleToDraft = (a: Pick<KbArticle, "id">, c?: string | null) => transition(a, "restore", c);

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
    if (error) {
      console.error("[knowledge-review] load history failed", error);
      return { data: null, error: "Could not load review history." };
    }
    return { data: (data ?? []) as KbReviewEvent[], error: null };
  } catch (e) {
    console.error("[knowledge-review] load history failed", e);
    return { data: null, error: "Could not load review history." };
  }
}
