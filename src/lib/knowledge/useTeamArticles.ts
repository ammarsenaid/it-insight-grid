import { useEffect, useRef, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { KbArticle, KbSpace, KbCategory } from "./backend-types";

/**
 * Lightweight read-only hook that loads articles + spaces + categories
 * for the user's first accessible team. Used by cross-platform integrations
 * (dashboard widgets, command palette, global search) so they reflect
 * real backend knowledge instead of the in-memory prototype store.
 *
 * Intentionally minimal — the full workspace uses `useKnowledgeBackend`
 * with team switching, tags, revisions, etc.
 */
export interface TeamArticlesState {
  teamId: string | null;
  spaces: KbSpace[];
  categories: KbCategory[];
  articles: KbArticle[];
  loading: boolean;
  error: string | null;
}

const EMPTY: Omit<TeamArticlesState, "teamId" | "loading" | "error"> = {
  spaces: [],
  categories: [],
  articles: [],
};

export function useTeamArticles(): TeamArticlesState {
  const { teams } = useAuth();
  const teamId = teams[0]?.id ?? null;

  const [state, setState] = useState<TeamArticlesState>({
    teamId: null,
    ...EMPTY,
    loading: false,
    error: null,
  });
  const reqRef = useRef(0);

  useEffect(() => {
    const id = ++reqRef.current;
    if (!teamId || !isSupabaseConfigured) {
      setState({ teamId: null, ...EMPTY, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, teamId, loading: true, error: null }));
    (async () => {
      try {
        const sb = getSupabase();
        const [sp, ca, ar] = await Promise.all([
          sb.from("knowledge_spaces")
            .select("id, team_id, name, slug, description, is_archived, created_by, created_at, updated_at")
            .eq("team_id", teamId),
          sb.from("knowledge_categories")
            .select("id, team_id, space_id, name, slug, description, sort_order, is_archived, created_by, created_at, updated_at")
            .eq("team_id", teamId),
          sb.from("knowledge_articles")
            .select("id, team_id, space_id, category_id, title, slug, excerpt, content_markdown, status, visibility, revision_number, created_by, updated_by, published_at, created_at, updated_at")
            .eq("team_id", teamId)
            .order("updated_at", { ascending: false }),
        ]);
        if (id !== reqRef.current) return;
        const err = sp.error || ca.error || ar.error;
        if (err) {
          setState({ teamId, ...EMPTY, loading: false, error: "Failed to load knowledge." });
          return;
        }
        setState({
          teamId,
          spaces: (sp.data ?? []) as KbSpace[],
          categories: (ca.data ?? []) as KbCategory[],
          articles: (ar.data ?? []) as KbArticle[],
          loading: false,
          error: null,
        });
      } catch (e) {
        if (id !== reqRef.current) return;
        setState({ teamId, ...EMPTY, loading: false, error: "Unexpected error." });
      }
    })();
  }, [teamId]);

  return state;
}
