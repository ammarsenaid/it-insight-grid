import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import type {
  KbArticle,
  KbArticleTag,
  KbCategory,
  KbRevision,
  KbSpace,
  KbTag,
  KnowledgeBackendData,
} from "./backend-types";

interface State {
  data: KnowledgeBackendData | null;
  loading: boolean;
  error: string | null;
}

const EMPTY: KnowledgeBackendData = {
  spaces: [],
  categories: [],
  articles: [],
  tags: [],
  articleTags: [],
};

export function useKnowledgeBackend(teamId: string | null) {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null });

  const load = useCallback(async () => {
    if (!teamId) {
      setState({ data: EMPTY, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const sb = getSupabase();
      const [spacesRes, catsRes, artRes, tagsRes, atRes] = await Promise.all([
        sb
          .from("knowledge_spaces")
          .select("id, team_id, name, slug, description, is_archived, created_by, created_at, updated_at")
          .eq("team_id", teamId)
          .order("name", { ascending: true }),
        sb
          .from("knowledge_categories")
          .select(
            "id, team_id, space_id, name, slug, description, sort_order, is_archived, created_by, created_at, updated_at",
          )
          .eq("team_id", teamId)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        sb
          .from("knowledge_articles")
          .select(
            "id, team_id, space_id, category_id, title, slug, excerpt, content_markdown, status, visibility, revision_number, created_by, updated_by, published_at, created_at, updated_at",
          )
          .eq("team_id", teamId)
          .order("updated_at", { ascending: false }),
        sb
          .from("knowledge_tags")
          .select("id, team_id, name, slug, created_at, updated_at")
          .eq("team_id", teamId)
          .order("name", { ascending: true }),
        sb
          .from("knowledge_article_tags")
          .select("article_id, tag_id, team_id")
          .eq("team_id", teamId),
      ]);

      const firstErr =
        spacesRes.error || catsRes.error || artRes.error || tagsRes.error || atRes.error;
      if (firstErr) {
        console.error("[knowledge-backend] load failed", firstErr);
        setState({
          data: null,
          loading: false,
          error: "Could not load knowledge data for this team.",
        });
        return;
      }

      setState({
        data: {
          spaces: (spacesRes.data ?? []) as KbSpace[],
          categories: (catsRes.data ?? []) as KbCategory[],
          articles: (artRes.data ?? []) as KbArticle[],
          tags: (tagsRes.data ?? []) as KbTag[],
          articleTags: (atRes.data ?? []) as KbArticleTag[],
        },
        loading: false,
        error: null,
      });
    } catch (e) {
      console.error("[knowledge-backend] unexpected error", e);
      setState({
        data: null,
        loading: false,
        error: "Unexpected error while loading knowledge data.",
      });
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}

export async function fetchArticleRevisions(articleId: string, teamId: string): Promise<{
  data: KbRevision[] | null;
  error: string | null;
}> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("knowledge_article_revisions")
      .select(
        "id, article_id, team_id, version_number, space_id, category_id, title, slug, excerpt, content_markdown, status, visibility, edited_by, created_at",
      )
      .eq("article_id", articleId)
      .eq("team_id", teamId)
      .order("version_number", { ascending: false });
    if (error) {
      console.error("[knowledge-backend] revisions failed", error);
      return { data: null, error: "Could not load revision history." };
    }
    return { data: (data ?? []) as KbRevision[], error: null };
  } catch (e) {
    console.error("[knowledge-backend] revisions error", e);
    return { data: null, error: "Unexpected error loading revisions." };
  }
}
