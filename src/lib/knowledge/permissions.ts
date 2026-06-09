import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/integrations/supabase/client";

/**
 * Per-team permission flags used to gate the knowledge-base UI.
 *
 * RLS is still the authoritative security boundary on the database side —
 * these flags only drive what affordances we render in the UI so users
 * never see buttons that would fail.
 */
export interface KnowledgePermissions {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  manageTeam: boolean;
}

const EMPTY: KnowledgePermissions = {
  read: false,
  create: false,
  update: false,
  delete: false,
  manageTeam: false,
};

const KEYS = [
  "knowledge.read",
  "knowledge.create",
  "knowledge.update",
  "knowledge.delete",
  "team.manage",
] as const;

export function useKnowledgePermissions(teamId: string | null) {
  const [perms, setPerms] = useState<KnowledgePermissions>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const currentTeamRef = useRef<string | null>(teamId);

  useEffect(() => {
    const id = ++requestRef.current;
    currentTeamRef.current = teamId;

    if (!teamId) {
      setPerms(EMPTY);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const sb = getSupabase();
        const results = await Promise.all(
          KEYS.map((key) => sb.rpc("has_permission", { _permission_key: key, _team_id: teamId })),
        );
        if (id !== requestRef.current || teamId !== currentTeamRef.current) return;
        const anyErr = results.find((r) => r.error);
        if (anyErr?.error) {
          console.error("[knowledge-perm] has_permission failed", anyErr.error);
          setPerms(EMPTY);
          setError("Could not resolve knowledge permissions for this team.");
        } else {
          setPerms({
            read: Boolean(results[0].data),
            create: Boolean(results[1].data),
            update: Boolean(results[2].data),
            delete: Boolean(results[3].data),
            manageTeam: Boolean(results[4].data),
          });
        }
      } catch (e) {
        if (id !== requestRef.current || teamId !== currentTeamRef.current) return;
        console.error("[knowledge-perm] unexpected", e);
        setPerms(EMPTY);
        setError("Unexpected error while resolving permissions.");
      } finally {
        if (id === requestRef.current && teamId === currentTeamRef.current) {
          setLoading(false);
        }
      }
    })();
  }, [teamId]);

  return { perms, loading, error };
}
