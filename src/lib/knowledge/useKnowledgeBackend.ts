import { useCallback, useEffect, useRef, useState } from "react";
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
  /** Team id that owns the data/error currently stored in state. */
  ownerTeamId: string | null;
}

const EMPTY: KnowledgeBackendData = {
  spaces: [],
  categories: [],
  articles: [],
  tags: [],
  articleTags: [],
  shelves: [],
  shelfBooks: [],
};

export function useKnowledgeBackend(teamId: string | null) {
  const [state, setState] = useState<State>({
    data: null,
    loading: false,
    error: null,
    ownerTeamId: null,
  });

  // Monotonic request counter — only the latest request may write to state.
  const requestIdRef = useRef(0);
  // Track the team id the consumer currently expects.
  const currentTeamIdRef = useRef<string | null>(teamId);

  const load = useCallback(async () => {
    // Bump generation; capture the team id this request is bound to.
    const myRequestId = ++requestIdRef.current;
    const requestedTeamId = teamId;
    currentTeamIdRef.current = requestedTeamId;

    if (!requestedTeamId) {
      // No team — clear immediately and do not query.
      setState({ data: EMPTY, loading: false, error: null, ownerTeamId: null });
      return;
    }

    // Immediately clear prior team's data so it cannot render under the new selector.
    setState({ data: null, loading: true, error: null, ownerTeamId: requestedTeamId });

    try {
      const sb = getSupabase();
      const [spacesRes, catsRes, artRes, tagsRes, atRes, shelvesRes, shelfBooksRes] =
        await Promise.all([
          sb
            .from("knowledge_spaces")
            .select("id, team_id, name, slug, description, is_archived, created_by, created_at, updated_at")
            .eq("team_id", requestedTeamId)
            .order("name", { ascending: true }),
          sb
            .from("knowledge_categories")
            .select(
              "id, team_id, space_id, name, slug, description, sort_order, is_archived, created_by, created_at, updated_at",
            )
            .eq("team_id", requestedTeamId)
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          sb
            .from("knowledge_articles")
            .select(
              "id, team_id, space_id, category_id, title, slug, excerpt, content_markdown, status, visibility, revision_number, created_by, updated_by, published_at, created_at, updated_at",
            )
            .eq("team_id", requestedTeamId)
            .order("updated_at", { ascending: false }),
          sb
            .from("knowledge_tags")
            .select("id, team_id, name, slug, created_at, updated_at")
            .eq("team_id", requestedTeamId)
            .order("name", { ascending: true }),
          sb
            .from("knowledge_article_tags")
            .select("article_id, tag_id, team_id")
            .eq("team_id", requestedTeamId),
          // Shelves + junction. These tables only exist after the
          // 20260618000000_knowledge_shelves migration is applied; before
          // that, the request fails (404/42P01) and we fall back to [].
          sb
            .from("knowledge_shelves")
            .select(
              "id, team_id, name, slug, description, cover_color, sort_order, is_archived, created_by, created_at, updated_at",
            )
            .eq("team_id", requestedTeamId)
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          sb
            .from("knowledge_shelf_books")
            .select("shelf_id, space_id, team_id, sort_order, added_at")
            .eq("team_id", requestedTeamId),
        ]);

      // Discard late responses: a newer request has superseded this one,
      // or the consumer has since changed the requested team id.
      if (
        myRequestId !== requestIdRef.current ||
        requestedTeamId !== currentTeamIdRef.current
      ) {
        return;
      }

      // Shelves are optional pre-migration — never fail the whole load on them.
      const shelvesData = shelvesRes.error ? [] : (shelvesRes.data ?? []);
      const shelfBooksData = shelfBooksRes.error ? [] : (shelfBooksRes.data ?? []);

      const firstErr =
        spacesRes.error || catsRes.error || artRes.error || tagsRes.error || atRes.error;
      if (firstErr) {
        console.error("[knowledge-backend] load failed", firstErr);
        setState({
          data: null,
          loading: false,
          error: "Could not load knowledge data for this team.",
          ownerTeamId: requestedTeamId,
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
          shelves: shelvesData as KnowledgeBackendData["shelves"],
          shelfBooks: shelfBooksData as KnowledgeBackendData["shelfBooks"],
        },
        loading: false,
        error: null,
        ownerTeamId: requestedTeamId,
      });
    } catch (e) {
      if (
        myRequestId !== requestIdRef.current ||
        requestedTeamId !== currentTeamIdRef.current
      ) {
        return;
      }
      console.error("[knowledge-backend] unexpected error", e);
      setState({
        data: null,
        loading: false,
        error: "Unexpected error while loading knowledge data.",
        ownerTeamId: requestedTeamId,
      });
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Never expose another team's data through this hook.
  const safeData = state.ownerTeamId === teamId ? state.data : null;
  const safeError = state.ownerTeamId === teamId ? state.error : null;
  const safeLoading = state.loading || state.ownerTeamId !== teamId;

  return {
    data: safeData,
    loading: teamId ? safeLoading : false,
    error: safeError,
    reload: load,
  };
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
