import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { KbArticle, KbSpace, KbCategory } from "./backend-types";

/**
 * Cross-team read-only knowledge loader used by dashboard widgets,
 * the command palette, and global search.
 *
 * RC1.1 change: instead of silently picking `teams[0]`, this loads
 * articles across every team that the authenticated user can see.
 * RLS remains authoritative — the IN-filter is just a quick pre-cut.
 *
 * Stale-response protection: each effect run carries an incrementing
 * request id; only the latest in-flight request is allowed to update
 * state. Late errors from older requests are discarded so they cannot
 * overwrite a newer successful result.
 */

export interface TeamArticleWithContext extends KbArticle {
  /** Human-readable team name from `useAuth().teams`. */
  team_name: string;
}

export interface TeamArticlesState {
  /** First accessible team id, kept for legacy callers (deep linking, etc.). */
  teamId: string | null;
  /** Lookup of team name by id, for rendering team context in results. */
  teamsById: Record<string, string>;
  spaces: KbSpace[];
  categories: KbCategory[];
  articles: TeamArticleWithContext[];
  loading: boolean;
  error: string | null;
}

const EMPTY: Omit<TeamArticlesState, "teamId" | "loading" | "error"> = {
  teamsById: {},
  spaces: [],
  categories: [],
  articles: [],
};

export function useTeamArticles(): TeamArticlesState {
  const { teams } = useAuth();

  // Stable signature so the effect only re-runs when the team set actually changes.
  const teamIds = useMemo(() => teams.map((t) => t.id).sort(), [teams]);
  const teamsKey = teamIds.join(",");
  const teamsById = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const t of teams) m[t.id] = t.name;
    return m;
  }, [teams]);

  const [state, setState] = useState<TeamArticlesState>({
    teamId: null,
    ...EMPTY,
    loading: false,
    error: null,
  });
  const reqRef = useRef(0);

  useEffect(() => {
    const id = ++reqRef.current;
    if (teamIds.length === 0 || !isSupabaseConfigured) {
      setState({ teamId: null, ...EMPTY, loading: false, error: null });
      return;
    }
    // Clear stale rows while team scope changes so consumers don't
    // render old-team data labelled as new-team data for a frame.
    setState({
      teamId: teamIds[0],
      ...EMPTY,
      teamsById,
      loading: true,
      error: null,
    });

    (async () => {
      try {
        const sb = getSupabase();
        const [sp, ca, ar] = await Promise.all([
          sb.from("knowledge_spaces")
            .select("id, team_id, name, slug, description, is_archived, created_by, created_at, updated_at")
            .in("team_id", teamIds),
          sb.from("knowledge_categories")
            .select("id, team_id, space_id, name, slug, description, sort_order, is_archived, created_by, created_at, updated_at")
            .in("team_id", teamIds),
          sb.from("knowledge_articles")
            .select("id, team_id, space_id, category_id, title, slug, excerpt, content_markdown, status, visibility, revision_number, created_by, updated_by, published_at, created_at, updated_at")
            .in("team_id", teamIds)
            .order("updated_at", { ascending: false }),
        ]);
        if (id !== reqRef.current) return; // discard stale response

        const err = sp.error || ca.error || ar.error;
        if (err) {
          console.error("[knowledge-team-articles] load failed", err);
          setState({ teamId: teamIds[0], ...EMPTY, teamsById, loading: false, error: "Failed to load knowledge." });
          return;
        }
        const articles = ((ar.data ?? []) as KbArticle[]).map((a) => ({
          ...a,
          team_name: teamsById[a.team_id] ?? "Unknown team",
        }));
        setState({
          teamId: teamIds[0],
          teamsById,
          spaces: (sp.data ?? []) as KbSpace[],
          categories: (ca.data ?? []) as KbCategory[],
          articles,
          loading: false,
          error: null,
        });
      } catch (e) {
        if (id !== reqRef.current) return; // discard late error
        console.error("[knowledge-team-articles] unexpected", e);
        setState({ teamId: teamIds[0], ...EMPTY, teamsById, loading: false, error: "Unexpected error." });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsKey]);

  return state;
}
