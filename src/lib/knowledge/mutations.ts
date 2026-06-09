// Knowledge-base CRUD operations.
//
// All calls use the singleton browser Supabase client and rely on RLS
// as the authoritative security boundary. The frontend permission hook
// only hides controls — it never replaces server-side enforcement.
//
// Every function returns { error: string | null, data?: T } and never throws,
// so callers can render a toast / inline message safely.

import { getSupabase } from "@/integrations/supabase/client";
import type {
  ArticleStatus,
  KbArticle,
  KbCategory,
  KbRevision,
  KbSpace,
  KbTag,
} from "./backend-types";

type Result<T> = { data: T | null; error: string | null };

function msg(action: string, err: unknown): string {
  const detail = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  console.error(`[knowledge-mutations] ${action} failed`, err);
  return `${action} failed: ${detail}`;
}

// ---------- SPACES ----------

export async function createSpace(input: {
  teamId: string;
  name: string;
  slug: string;
  description?: string | null;
}): Promise<Result<KbSpace>> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("knowledge_spaces")
      .insert({
        team_id: input.teamId,
        name: input.name.trim(),
        slug: input.slug,
        description: input.description?.trim() || null,
      })
      .select("id, team_id, name, slug, description, is_archived, created_by, created_at, updated_at")
      .single();
    if (error) return { data: null, error: msg("Create space", error) };
    return { data: data as KbSpace, error: null };
  } catch (e) {
    return { data: null, error: msg("Create space", e) };
  }
}

export async function updateSpace(input: {
  id: string;
  name?: string;
  slug?: string;
  description?: string | null;
  is_archived?: boolean;
}): Promise<Result<KbSpace>> {
  try {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.slug !== undefined) patch.slug = input.slug;
    if (input.description !== undefined) patch.description = input.description?.toString().trim() || null;
    if (input.is_archived !== undefined) patch.is_archived = input.is_archived;
    const sb = getSupabase();
    const { data, error } = await sb
      .from("knowledge_spaces")
      .update(patch)
      .eq("id", input.id)
      .select("id, team_id, name, slug, description, is_archived, created_by, created_at, updated_at")
      .single();
    if (error) return { data: null, error: msg("Update space", error) };
    return { data: data as KbSpace, error: null };
  } catch (e) {
    return { data: null, error: msg("Update space", e) };
  }
}

export async function deleteSpace(id: string): Promise<Result<true>> {
  try {
    const sb = getSupabase();
    const { error } = await sb.from("knowledge_spaces").delete().eq("id", id);
    if (error) return { data: null, error: msg("Delete space", error) };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: msg("Delete space", e) };
  }
}

// ---------- CATEGORIES ----------

export async function createCategory(input: {
  teamId: string;
  spaceId: string;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder?: number;
}): Promise<Result<KbCategory>> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("knowledge_categories")
      .insert({
        team_id: input.teamId,
        space_id: input.spaceId,
        name: input.name.trim(),
        slug: input.slug,
        description: input.description?.trim() || null,
        sort_order: input.sortOrder ?? 0,
      })
      .select(
        "id, team_id, space_id, name, slug, description, sort_order, is_archived, created_by, created_at, updated_at",
      )
      .single();
    if (error) return { data: null, error: msg("Create category", error) };
    return { data: data as KbCategory, error: null };
  } catch (e) {
    return { data: null, error: msg("Create category", e) };
  }
}

export async function updateCategory(input: {
  id: string;
  name?: string;
  slug?: string;
  description?: string | null;
  sort_order?: number;
  is_archived?: boolean;
}): Promise<Result<KbCategory>> {
  try {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.slug !== undefined) patch.slug = input.slug;
    if (input.description !== undefined) patch.description = input.description?.toString().trim() || null;
    if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
    if (input.is_archived !== undefined) patch.is_archived = input.is_archived;
    const sb = getSupabase();
    const { data, error } = await sb
      .from("knowledge_categories")
      .update(patch)
      .eq("id", input.id)
      .select(
        "id, team_id, space_id, name, slug, description, sort_order, is_archived, created_by, created_at, updated_at",
      )
      .single();
    if (error) return { data: null, error: msg("Update category", error) };
    return { data: data as KbCategory, error: null };
  } catch (e) {
    return { data: null, error: msg("Update category", e) };
  }
}

export async function deleteCategory(id: string): Promise<Result<true>> {
  try {
    const sb = getSupabase();
    const { error } = await sb.from("knowledge_categories").delete().eq("id", id);
    if (error) return { data: null, error: msg("Delete category", error) };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: msg("Delete category", e) };
  }
}

// ---------- ARTICLES ----------

export async function createArticle(input: {
  teamId: string;
  spaceId: string;
  categoryId: string | null;
  title: string;
  slug: string;
  excerpt?: string | null;
  contentMarkdown?: string;
  status?: ArticleStatus;
  visibility?: string;
}): Promise<Result<KbArticle>> {
  try {
    const sb = getSupabase();
    const { data: userRes } = await sb.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return { data: null, error: "Create article failed: not signed in." };
    const { data, error } = await sb
      .from("knowledge_articles")
      .insert({
        team_id: input.teamId,
        space_id: input.spaceId,
        category_id: input.categoryId,
        title: input.title.trim(),
        slug: input.slug,
        excerpt: input.excerpt?.trim() || null,
        content_markdown: input.contentMarkdown ?? "",
        status: input.status ?? "draft",
        visibility: input.visibility ?? "team",
        // Insert policy requires created_by = updated_by = auth.uid()
        created_by: uid,
        updated_by: uid,
      })
      .select(
        "id, team_id, space_id, category_id, title, slug, excerpt, content_markdown, status, visibility, revision_number, created_by, updated_by, published_at, created_at, updated_at",
      )
      .single();
    if (error) return { data: null, error: msg("Create article", error) };
    return { data: data as KbArticle, error: null };
  } catch (e) {
    return { data: null, error: msg("Create article", e) };
  }
}

export async function updateArticle(input: {
  id: string;
  title?: string;
  slug?: string;
  excerpt?: string | null;
  contentMarkdown?: string;
  categoryId?: string | null;
  status?: ArticleStatus;
  visibility?: string;
}): Promise<Result<KbArticle>> {
  try {
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.slug !== undefined) patch.slug = input.slug;
    if (input.excerpt !== undefined) patch.excerpt = input.excerpt?.toString().trim() || null;
    if (input.contentMarkdown !== undefined) patch.content_markdown = input.contentMarkdown;
    if (input.categoryId !== undefined) patch.category_id = input.categoryId;
    if (input.status !== undefined) patch.status = input.status;
    if (input.visibility !== undefined) patch.visibility = input.visibility;

    const sb = getSupabase();
    const { data, error } = await sb
      .from("knowledge_articles")
      .update(patch)
      .eq("id", input.id)
      .select(
        "id, team_id, space_id, category_id, title, slug, excerpt, content_markdown, status, visibility, revision_number, created_by, updated_by, published_at, created_at, updated_at",
      )
      .single();
    if (error) return { data: null, error: msg("Update article", error) };
    return { data: data as KbArticle, error: null };
  } catch (e) {
    return { data: null, error: msg("Update article", e) };
  }
}

export async function publishArticle(id: string): Promise<Result<KbArticle>> {
  return updateArticle({ id, status: "published" });
}

export async function archiveArticle(id: string): Promise<Result<KbArticle>> {
  return updateArticle({ id, status: "archived" });
}

export async function restoreArticleToDraft(id: string): Promise<Result<KbArticle>> {
  return updateArticle({ id, status: "draft" });
}

export async function deleteArticle(id: string): Promise<Result<true>> {
  try {
    const sb = getSupabase();
    const { error } = await sb.from("knowledge_articles").delete().eq("id", id);
    if (error) return { data: null, error: msg("Delete article", error) };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: msg("Delete article", e) };
  }
}

/** Apply a previous revision's content to the article (creates a new revision via the trigger). */
export async function restoreArticleRevision(
  articleId: string,
  rev: Pick<KbRevision, "title" | "slug" | "excerpt" | "content_markdown" | "category_id">,
): Promise<Result<KbArticle>> {
  return updateArticle({
    id: articleId,
    title: rev.title,
    slug: rev.slug,
    excerpt: rev.excerpt,
    contentMarkdown: rev.content_markdown ?? "",
    categoryId: rev.category_id,
  });
}

// ---------- TAGS ----------

export async function createTag(input: {
  teamId: string;
  name: string;
  slug: string;
}): Promise<Result<KbTag>> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("knowledge_tags")
      .insert({ team_id: input.teamId, name: input.name.trim(), slug: input.slug })
      .select("id, team_id, name, slug, created_at, updated_at")
      .single();
    if (error) return { data: null, error: msg("Create tag", error) };
    return { data: data as KbTag, error: null };
  } catch (e) {
    return { data: null, error: msg("Create tag", e) };
  }
}

export async function updateTag(input: {
  id: string;
  name?: string;
  slug?: string;
}): Promise<Result<KbTag>> {
  try {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.slug !== undefined) patch.slug = input.slug;
    const sb = getSupabase();
    const { data, error } = await sb
      .from("knowledge_tags")
      .update(patch)
      .eq("id", input.id)
      .select("id, team_id, name, slug, created_at, updated_at")
      .single();
    if (error) return { data: null, error: msg("Update tag", error) };
    return { data: data as KbTag, error: null };
  } catch (e) {
    return { data: null, error: msg("Update tag", e) };
  }
}

export async function deleteTag(id: string): Promise<Result<true>> {
  try {
    const sb = getSupabase();
    const { error } = await sb.from("knowledge_tags").delete().eq("id", id);
    if (error) return { data: null, error: msg("Delete tag", error) };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: msg("Delete tag", e) };
  }
}

export async function assignTag(input: {
  teamId: string;
  articleId: string;
  tagId: string;
}): Promise<Result<true>> {
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("knowledge_article_tags")
      .insert({ team_id: input.teamId, article_id: input.articleId, tag_id: input.tagId });
    if (error) return { data: null, error: msg("Assign tag", error) };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: msg("Assign tag", e) };
  }
}

export async function unassignTag(input: { articleId: string; tagId: string }): Promise<Result<true>> {
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("knowledge_article_tags")
      .delete()
      .eq("article_id", input.articleId)
      .eq("tag_id", input.tagId);
    if (error) return { data: null, error: msg("Remove tag", error) };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: msg("Remove tag", e) };
  }
}
