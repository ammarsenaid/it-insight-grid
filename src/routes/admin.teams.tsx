import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UsersRound, Plus, Lock, Search, MoreHorizontal, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { DetailsDrawer } from "@/components/common/DetailsDrawer";
import { FormDrawer } from "@/components/common/FormDrawer";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useAuth } from "@/lib/auth/AuthProvider";
import { can, useRole } from "@/lib/permissions";
import { formatTeamsError } from "@/lib/teams/errors";
import {
  teamsKeys,
  teamsQuery,
  teamMembersQuery,
  teamRolesQuery,
  profilesQuery,
} from "@/lib/teams/queries";
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  removeTeamMember,
  setTeamMemberRole,
  slugify,
  updateTeam,
} from "@/lib/teams/teams";
import type { TeamInput, TeamSummary } from "@/lib/teams/types";

export const Route = createFileRoute("/admin/teams")({
  head: () => ({ meta: [{ title: "Teams · IT Knowledge Center" }] }),
  component: AdminTeamsPage,
});

const EMPTY: TeamInput = { name: "", slug: "", description: "" };

function AdminTeamsPage() {
  const { session } = useAuth();
  const role = useRole();
  const allowed = can("admin.teams", role);
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TeamSummary | null>(null);
  const [details, setDetails] = useState<TeamSummary | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TeamSummary | null>(null);
  const [draft, setDraft] = useState<TeamInput>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);

  const enabled = Boolean(session?.user) && allowed;
  const { data, isLoading, isError, error, refetch } = useQuery({ ...teamsQuery(), enabled });

  const visible = useMemo(() => {
    const teams = data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return teams;
    return teams.filter((t) =>
      [t.name, t.description ?? "", t.slug].some((v) => v.toLowerCase().includes(needle)),
    );
  }, [data, q]);

  const invalidateTeams = () => qc.invalidateQueries({ queryKey: teamsKeys.list() });

  const createMutation = useMutation({
    mutationFn: (input: TeamInput) => createTeam({ ...input, slug: slugify(input.slug) }),
    onSuccess: () => {
      invalidateTeams();
      setCreateOpen(false);
      toast.success("Team created");
    },
    onError: (e) => toast.error(formatTeamsError(e, "Failed to create team")),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TeamInput }) =>
      updateTeam(id, { ...input, slug: slugify(input.slug) }),
    onSuccess: () => {
      invalidateTeams();
      setEditing(null);
      toast.success("Team updated");
    },
    onError: (e) => toast.error(formatTeamsError(e, "Failed to update team")),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTeam(id),
    onSuccess: () => {
      invalidateTeams();
      setConfirmDelete(null);
      setDetails(null);
      toast.success("Team deleted");
    },
    onError: (e) => toast.error(formatTeamsError(e, "Failed to delete team")),
  });

  function openCreate() {
    setDraft(EMPTY);
    setSlugTouched(false);
    setCreateOpen(true);
  }
  function openEdit(t: TeamSummary) {
    setDraft({ name: t.name, slug: t.slug, description: t.description ?? "" });
    setSlugTouched(true);
    setEditing(t);
  }
  function submitCreate() {
    if (!draft.name.trim()) {
      toast.error("Team name is required");
      return;
    }
    if (!slugify(draft.slug)) {
      toast.error("Team slug is required");
      return;
    }
    createMutation.mutate(draft);
  }
  function submitEdit() {
    if (!editing) return;
    if (!draft.name.trim()) {
      toast.error("Team name is required");
      return;
    }
    if (!slugify(draft.slug)) {
      toast.error("Team slug is required");
      return;
    }
    updateMutation.mutate({ id: editing.id, input: draft });
  }

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Teams" description="Service desk and operations teams." />
        <EmptyState
          icon={Lock}
          title="Admin access required"
          description="Switch to the IT Administrator role via the profile menu to manage teams."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Teams"
        description="Manage teams, ownership and membership."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Add team
          </Button>
        }
      />

      <div className="mb-4 flex items-center justify-end">
        <div className="relative max-w-sm flex-1 sm:w-72 sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search teams…"
            className="pl-9"
          />
        </div>
      </div>

      <SectionCard contentClassName="p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading teams…</div>
        ) : isError ? (
          <EmptyState
            icon={AlertCircle}
            title="Could not load teams"
            description={formatTeamsError(error, "Unexpected error")}
            actionLabel="Retry"
            onAction={() => refetch()}
            className="m-4"
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No teams"
            description="Create your first team."
            className="m-4"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => setDetails(t)}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    {t.description && (
                      <div className="line-clamp-1 text-xs text-muted-foreground">
                        {t.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.slug}</TableCell>
                  <TableCell className="text-sm">{t.memberCount}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetails(t)}>
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(t)}>Edit team</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setConfirmDelete(t)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <FormDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New team"
        onSubmit={submitCreate}
        submitLabel="Create team"
      >
        <TeamForm
          draft={draft}
          setDraft={setDraft}
          slugTouched={slugTouched}
          setSlugTouched={setSlugTouched}
        />
      </FormDrawer>

      <FormDrawer
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={`Edit ${editing?.name ?? "team"}`}
        onSubmit={submitEdit}
        submitLabel="Save changes"
      >
        <TeamForm
          draft={draft}
          setDraft={setDraft}
          slugTouched={slugTouched}
          setSlugTouched={setSlugTouched}
        />
      </FormDrawer>

      <DetailsDrawer
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        title={details?.name ?? ""}
        description={details?.description ?? undefined}
        actions={
          details && (
            <>
              <Button size="sm" variant="secondary" onClick={() => openEdit(details)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => setConfirmDelete(details)}
              >
                Delete
              </Button>
            </>
          )
        }
      >
        {details && <TeamDetails team={details} />}
      </DetailsDrawer>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.name}?`}
        description="The team and its membership will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
      />
    </div>
  );
}

function TeamForm({
  draft,
  setDraft,
  slugTouched,
  setSlugTouched,
}: {
  draft: TeamInput;
  setDraft: (d: TeamInput) => void;
  slugTouched: boolean;
  setSlugTouched: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Team name</Label>
        <Input
          value={draft.name}
          onChange={(e) => {
            const name = e.target.value;
            setDraft({ ...draft, name, slug: slugTouched ? draft.slug : slugify(name) });
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Slug</Label>
        <Input
          value={draft.slug}
          onChange={(e) => {
            setSlugTouched(true);
            setDraft({ ...draft, slug: e.target.value });
          }}
        />
        <p className="text-xs text-muted-foreground">
          Lowercase letters, numbers and hyphens. Used as the team's unique identifier.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Description</Label>
        <Textarea
          rows={2}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>
    </div>
  );
}

function TeamDetails({ team }: { team: TeamSummary }) {
  const qc = useQueryClient();
  const membersQ = useQuery(teamMembersQuery(team.id));
  const rolesQ = useQuery(teamRolesQuery());
  const profilesQ = useQuery(profilesQuery());

  const members = membersQ.data ?? [];
  const roles = rolesQ.data ?? [];
  const allProfiles = profilesQ.data ?? [];

  const [addUserId, setAddUserId] = useState("");
  const [addRoleKey, setAddRoleKey] = useState("team_viewer");

  const invalidateMembers = () => {
    qc.invalidateQueries({ queryKey: teamsKeys.members(team.id) });
    qc.invalidateQueries({ queryKey: teamsKeys.list() });
  };

  const addMutation = useMutation({
    mutationFn: () => addTeamMember(team.id, addUserId, addRoleKey),
    onSuccess: () => {
      invalidateMembers();
      setAddUserId("");
      toast.success("Member added");
    },
    onError: (e) => toast.error(formatTeamsError(e, "Failed to add member")),
  });
  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeTeamMember(team.id, userId),
    onSuccess: () => {
      invalidateMembers();
      toast.success("Member removed");
    },
    onError: (e) => toast.error(formatTeamsError(e, "Failed to remove member")),
  });
  const roleMutation = useMutation({
    mutationFn: ({ userId, roleKey }: { userId: string; roleKey: string }) =>
      setTeamMemberRole(team.id, userId, roleKey),
    onSuccess: () => {
      invalidateMembers();
      toast.success("Role updated");
    },
    onError: (e) => toast.error(formatTeamsError(e, "Failed to update role")),
  });

  const memberIds = new Set(members.map((m) => m.userId));
  const availableProfiles = allProfiles.filter((p) => !memberIds.has(p.id));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Members" value={String(members.length)} />
        <Stat label="Slug" value={team.slug} />
        <Stat label="Created" value={new Date(team.createdAt).toLocaleDateString()} />
      </div>

      <SectionCard title="Members">
        {membersQ.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading members…</p>
        ) : membersQ.isError ? (
          <TeamQueryError
            label="Could not load team members"
            error={membersQ.error}
            onRetry={() => membersQ.refetch()}
          />
        ) : members.length === 0 ? (
          <p className="text-xs text-muted-foreground">No members.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.displayName}</div>
                  {m.email && (
                    <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Select
                    value={m.roleKey ?? undefined}
                    onValueChange={(v) => roleMutation.mutate({ userId: m.userId, roleKey: v })}
                  >
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.roleKey} value={r.roleKey}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeMutation.mutate(m.userId)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {rolesQ.isError && (
          <TeamQueryError
            label="Could not load team roles"
            error={rolesQ.error}
            onRetry={() => rolesQ.refetch()}
          />
        )}
        {profilesQ.isError && (
          <TeamQueryError
            label="Could not load profiles"
            error={profilesQ.error}
            onRetry={() => profilesQ.refetch()}
          />
        )}

        <div className="mt-3 flex items-center gap-1.5 border-t border-border/40 pt-3">
          <Select value={addUserId || undefined} onValueChange={setAddUserId}>
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue placeholder="Add member…" />
            </SelectTrigger>
            <SelectContent>
              {availableProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={addRoleKey} onValueChange={setAddRoleKey}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.roleKey} value={r.roleKey}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!addUserId || addMutation.isPending || rolesQ.isError || profilesQ.isError}
            onClick={() => addMutation.mutate()}
          >
            Add
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

function TeamQueryError({
  label,
  error,
  onRetry,
}: {
  label: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
      <div className="font-medium">{label}</div>
      <div className="mt-0.5 break-words">
        {formatTeamsError(error, "Unexpected backend error")}
      </div>
      <Button size="sm" variant="ghost" className="mt-1 h-7 px-2" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}
