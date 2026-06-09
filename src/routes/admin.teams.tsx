import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { UsersRound, Plus, Lock, Search, MoreHorizontal, Trash2, Ticket, Server, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ActivityTimeline, type TimelineEntry } from "@/components/common/ActivityTimeline";
import { DetailsDrawer } from "@/components/common/DetailsDrawer";
import { FormDrawer } from "@/components/common/FormDrawer";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { useData } from "@/lib/data/store";
import { can, useRole } from "@/lib/permissions";
import { createTeam, deleteTeam, teamStats, updateTeam, type TeamInput } from "@/lib/data/teams";
import { roleLabel } from "@/lib/data/users";
import type { Team } from "@/lib/data/types";

export const Route = createFileRoute("/admin/teams")({
  head: () => ({ meta: [{ title: "Teams · IT Knowledge Center" }] }),
  component: AdminTeamsPage,
});

const EMPTY: TeamInput = { name: "", description: "", leadUserId: undefined, memberIds: [], queueOwnership: [], assetScopes: [] };

const ASSET_KINDS = ["server", "vm", "computer", "network", "application", "storage"];

function AdminTeamsPage() {
  const data = useData();
  const role = useRole();
  const allowed = can("admin.teams", role);

  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [details, setDetails] = useState<Team | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Team | null>(null);
  const [draft, setDraft] = useState<TeamInput>(EMPTY);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return data.teams;
    return data.teams.filter((t) => [t.name, t.description].some((v) => v.toLowerCase().includes(needle)));
  }, [data.teams, q]);

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Teams" description="Service desk and operations teams." />
        <EmptyState icon={Lock} title="Admin access required" description="Switch to the IT Administrator role via the profile menu to manage teams." />
      </div>
    );
  }

  function openCreate() { setDraft(EMPTY); setCreateOpen(true); }
  function openEdit(t: Team) {
    setDraft({
      name: t.name,
      description: t.description,
      leadUserId: t.leadUserId,
      memberIds: [...t.memberIds],
      queueOwnership: [...t.queueOwnership],
      assetScopes: [...t.assetScopes],
    });
    setEditing(t);
  }
  function submitCreate() {
    if (!draft.name.trim()) { toast.error("Team name is required"); return; }
    createTeam(draft);
    setCreateOpen(false);
    toast.success("Team created");
  }
  function submitEdit() {
    if (!editing) return;
    updateTeam(editing.id, draft);
    setEditing(null);
    toast.success("Team updated");
  }

  return (
    <div>
      <PageHeader
        title="Teams"
        description="Service desk and operations teams — queue ownership, membership and asset scopes."
        actions={<Button size="sm" onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" /> New team</Button>}
      />

      <div className="mb-4 flex items-center justify-end">
        <div className="relative max-w-sm flex-1 sm:w-72 sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams…" className="pl-9" />
        </div>
      </div>

      <SectionCard contentClassName="p-0">
        {visible.length === 0 ? (
          <EmptyState icon={UsersRound} title="No teams" description="Create your first team." className="m-4" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Queues</TableHead>
                <TableHead>Open / Resolved</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((t) => {
                const stats = teamStats(t);
                const lead = t.leadUserId ? data.users.find((u) => u.id === t.leadUserId) : undefined;
                return (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => setDetails(t)}>
                    <TableCell>
                      <div className="font-medium">{t.name}</div>
                      <div className="line-clamp-1 text-xs text-muted-foreground">{t.description}</div>
                    </TableCell>
                    <TableCell className="text-sm">{lead?.displayName ?? "—"}</TableCell>
                    <TableCell className="text-sm">{t.memberIds.length}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {t.queueOwnership.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        {t.queueOwnership.slice(0, 3).map((q) => <Badge key={q} variant="outline" className="text-[10px]">{q}</Badge>)}
                        {t.queueOwnership.length > 3 && <Badge variant="outline" className="text-[10px]">+{t.queueOwnership.length - 3}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="text-[#FFC86B]">{stats.openTickets}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-[#52D6A4]">{stats.resolvedTickets}</span>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetails(t)}>View details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(t)}>Edit team</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setConfirmDelete(t)} className="text-destructive">
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <FormDrawer open={createOpen} onOpenChange={setCreateOpen} title="New team" onSubmit={submitCreate} submitLabel="Create team">
        <TeamForm draft={draft} setDraft={setDraft} />
      </FormDrawer>

      <FormDrawer open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={`Edit ${editing?.name ?? "team"}`} onSubmit={submitEdit} submitLabel="Save changes">
        <TeamForm draft={draft} setDraft={setDraft} />
      </FormDrawer>

      <DetailsDrawer
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        title={details?.name ?? ""}
        description={details?.description}
        actions={details && <Button size="sm" variant="secondary" onClick={() => openEdit(details)}>Edit</Button>}
      >
        {details && <TeamDetails team={details} />}
      </DetailsDrawer>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.name}?`}
        description="The team will be removed locally. Tickets and assets currently scoped to this team will keep the team name reference but lose this configuration."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete) {
            deleteTeam(confirmDelete.id);
            toast.success("Team deleted");
            setConfirmDelete(null);
          }
        }}
      />
    </div>
  );
}

function TeamForm({ draft, setDraft }: { draft: TeamInput; setDraft: (d: TeamInput) => void }) {
  const data = useData();
  const categories = data.ticketSettings.categories;
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Team name</Label>
        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Description</Label>
        <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Team lead</Label>
        <Select value={draft.leadUserId ?? "_none"} onValueChange={(v) => setDraft({ ...draft, leadUserId: v === "_none" ? undefined : v })}>
          <SelectTrigger><SelectValue placeholder="Select lead" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">— None —</SelectItem>
            {data.users.filter((u) => u.status === "active").map((u) => <SelectItem key={u.id} value={u.id}>{u.displayName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Members</Label>
        <div className="max-h-40 overflow-y-auto rounded-lg border border-border/40 p-2 text-sm">
          {data.users.filter((u) => u.status === "active").map((u) => {
            const checked = draft.memberIds.includes(u.id);
            return (
              <label key={u.id} className="flex cursor-pointer items-center gap-2 py-1">
                <Checkbox checked={checked} onCheckedChange={(c) => {
                  const next = c ? [...draft.memberIds, u.id] : draft.memberIds.filter((id) => id !== u.id);
                  setDraft({ ...draft, memberIds: next });
                }} />
                <span className="flex-1">{u.displayName}</span>
                <span className="text-xs text-muted-foreground">{roleLabel(u.role)}</span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Queue ownership (ticket categories)</Label>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const active = draft.queueOwnership.includes(c);
            return (
              <button type="button" key={c} onClick={() => setDraft({ ...draft, queueOwnership: active ? draft.queueOwnership.filter((x) => x !== c) : [...draft.queueOwnership, c] })} className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${active ? "border-primary/40 bg-primary/15 text-primary" : "border-border/40 bg-background/40 text-muted-foreground hover:bg-background/70"}`}>{c}</button>
            );
          })}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Asset scopes (CMDB types)</Label>
        <div className="flex flex-wrap gap-1.5">
          {ASSET_KINDS.map((k) => {
            const active = draft.assetScopes.includes(k);
            return (
              <button type="button" key={k} onClick={() => setDraft({ ...draft, assetScopes: active ? draft.assetScopes.filter((x) => x !== k) : [...draft.assetScopes, k] })} className={`rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors ${active ? "border-primary/40 bg-primary/15 text-primary" : "border-border/40 bg-background/40 text-muted-foreground hover:bg-background/70"}`}>{k}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TeamDetails({ team }: { team: Team }) {
  const data = useData();
  const stats = teamStats(team);
  const lead = team.leadUserId ? data.users.find((u) => u.id === team.leadUserId) : undefined;
  const members = data.users.filter((u) => team.memberIds.includes(u.id));
  const recentTickets = data.tickets.filter((t) => t.team === team.name).slice(0, 6);
  const activity: TimelineEntry[] = data.activity
    .filter((a) => a.entityType === "team" && a.entityId === team.id)
    .slice(0, 8)
    .map((a) => ({ id: a.id, title: a.message, timestamp: a.createdAt, icon: ShieldCheck, tone: "info" as const }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Ticket} label="Open" value={stats.openTickets} />
        <Stat icon={Ticket} label="Resolved" value={stats.resolvedTickets} />
        <Stat icon={Server} label="Scoped assets" value={stats.assetCount} />
      </div>

      <SectionCard title="Members">
        <div className="space-y-1.5 text-sm">
          {lead && <div className="flex items-center justify-between"><span className="font-medium">{lead.displayName}</span><Badge variant="outline" className="text-[10px]">Lead</Badge></div>}
          {members.filter((m) => m.id !== lead?.id).map((m) => (
            <div key={m.id} className="flex items-center justify-between text-muted-foreground">
              <span>{m.displayName}</span>
              <span className="text-xs">{roleLabel(m.role)}</span>
            </div>
          ))}
          {members.length === 0 && <p className="text-xs text-muted-foreground">No members.</p>}
        </div>
      </SectionCard>

      <SectionCard title="Queue ownership">
        <div className="flex flex-wrap gap-1.5">
          {team.queueOwnership.length === 0 && <span className="text-xs text-muted-foreground">No queues</span>}
          {team.queueOwnership.map((q) => <Badge key={q} variant="outline" className="text-[11px]">{q}</Badge>)}
        </div>
      </SectionCard>

      <SectionCard title="Asset scopes">
        <div className="flex flex-wrap gap-1.5">
          {team.assetScopes.length === 0 && <span className="text-xs text-muted-foreground">No scopes</span>}
          {team.assetScopes.map((s) => <Badge key={s} variant="outline" className="text-[11px] capitalize">{s}</Badge>)}
        </div>
      </SectionCard>

      <SectionCard title="Recent tickets">
        {recentTickets.length === 0 ? <p className="text-xs text-muted-foreground">No tickets routed to this team yet.</p> : (
          <ul className="space-y-1.5 text-sm">
            {recentTickets.map((t) => <li key={t.id} className="flex items-center justify-between gap-2"><span className="truncate">{t.number} — {t.subject}</span><StatusBadge label={t.status} tone="info" /></li>)}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Activity">
        <ActivityTimeline entries={activity} emptyLabel="No recorded activity for this team." />
      </SectionCard>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"><Icon className="h-3 w-3" /> {label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
