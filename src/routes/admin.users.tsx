import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Users, Plus, Lock, Search, Archive, RotateCcw, Mail, Building2, ShieldCheck, Ticket, CheckSquare, FileText, MoreHorizontal } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { useData } from "@/lib/data/store";
import { archiveUser, createUser, restoreUser, roleLabel, updateUser, userStats, type UserInput } from "@/lib/data/users";
import { ROLES, can, useRole, type Role } from "@/lib/permissions";
import type { User } from "@/lib/data/types";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users · IT Knowledge Center" }] }),
  component: AdminUsersPage,
});

const EMPTY_INPUT: UserInput = {
  username: "",
  displayName: "",
  email: "",
  department: "",
  team: "",
  role: "employee",
  title: "",
  notes: "",
};

function AdminUsersPage() {
  const data = useData();
  const role = useRole();
  const allowed = can("admin.users", role);

  const [tab, setTab] = useState<"active" | "archived">("active");
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [details, setDetails] = useState<User | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<User | null>(null);
  const [draft, setDraft] = useState<UserInput>(EMPTY_INPUT);

  const visible = useMemo(() => {
    const list = data.users.filter((u) => (tab === "active" ? u.status === "active" : u.status === "archived"));
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((u) =>
      [u.displayName, u.username, u.email, u.department, u.team, u.role, u.title ?? ""].some((v) => v.toLowerCase().includes(needle)),
    );
  }, [data.users, q, tab]);

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Users" description="Internal user directory." />
        <EmptyState icon={Lock} title="Admin access required" description="Switch to the IT Administrator role via the profile menu to manage users." />
      </div>
    );
  }

  function openCreate() {
    setDraft(EMPTY_INPUT);
    setCreateOpen(true);
  }
  function openEdit(u: User) {
    setDraft({
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      department: u.department,
      team: u.team,
      role: u.role as Role,
      title: u.title ?? "",
      notes: u.notes ?? "",
    });
    setEditing(u);
  }
  function submitCreate() {
    if (!draft.displayName.trim() || !draft.username.trim() || !draft.email.trim()) {
      toast.error("Display name, username and email are required");
      return;
    }
    createUser(draft);
    setCreateOpen(false);
    toast.success("User created");
  }
  function submitEdit() {
    if (!editing) return;
    updateUser(editing.id, draft);
    setEditing(null);
    toast.success("User updated");
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage workspace users and access."
        actions={<Button size="sm" onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" /> Add user</Button>}
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="active">Active ({data.users.filter((u) => u.status === "active").length})</TabsTrigger>
            <TabsTrigger value="archived">Archived ({data.users.filter((u) => u.status === "archived").length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative max-w-sm flex-1 sm:flex-none sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, team…" className="pl-9" />
        </div>
      </div>

      <SectionCard contentClassName="p-0">
        {visible.length === 0 ? (
          <EmptyState icon={Users} title="No users match your filters" description="Adjust search or change the tab." className="m-4" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((u) => (
                <TableRow key={u.id} className="cursor-pointer" onClick={() => setDetails(u)}>
                  <TableCell>
                    <div className="font-medium">{u.displayName}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">{u.department}</TableCell>
                  <TableCell className="text-sm">{u.team}</TableCell>
                  <TableCell><StatusBadge label={roleLabel(u.role)} tone="info" /></TableCell>
                  <TableCell><StatusBadge label={u.status} tone={u.status === "active" ? "success" : "muted"} /></TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetails(u)}>View details</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(u)}>Edit user</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {u.status === "active" ? (
                          <DropdownMenuItem onClick={() => setConfirmArchive(u)}>
                            <Archive className="mr-2 h-3.5 w-3.5" /> Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => { restoreUser(u.id); toast.success("User restored"); }}>
                            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Restore
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      {/* Create */}
      <FormDrawer open={createOpen} onOpenChange={setCreateOpen} title="Add user" onSubmit={submitCreate} submitLabel="Save user">
        <UserForm draft={draft} setDraft={setDraft} teams={data.teams.map((t) => t.name)} />
      </FormDrawer>

      {/* Edit */}
      <FormDrawer open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={`Edit ${editing?.displayName ?? "user"}`} onSubmit={submitEdit} submitLabel="Save changes">
        <UserForm draft={draft} setDraft={setDraft} teams={data.teams.map((t) => t.name)} />
      </FormDrawer>

      {/* Details */}
      <DetailsDrawer
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        title={details?.displayName ?? ""}
        description={details ? `${roleLabel(details.role)} · ${details.team}` : undefined}
        actions={details && (
          <>
            <Button size="sm" variant="secondary" onClick={() => openEdit(details)}>Edit</Button>
          </>
        )}
      >
        {details && <UserDetails user={details} />}
      </DetailsDrawer>

      <ConfirmDialog
        open={!!confirmArchive}
        onOpenChange={(o) => !o && setConfirmArchive(null)}
        title={`Archive ${confirmArchive?.displayName ?? "user"}?`}
        description="The user will be hidden from active lists but kept for audit. You can restore from the Archived tab."
        confirmLabel="Archive"
        destructive
        onConfirm={() => {
          if (confirmArchive) {
            archiveUser(confirmArchive.id);
            toast.success("User archived");
            setConfirmArchive(null);
          }
        }}
      />
    </div>
  );
}

function UserForm({ draft, setDraft, teams }: { draft: UserInput; setDraft: (d: UserInput) => void; teams: string[] }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Display name">
          <Input value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
        </Field>
        <Field label="Username">
          <Input value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
        </Field>
      </div>
      <Field label="Email">
        <Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Department">
          <Input value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
        </Field>
        <Field label="Team">
          <Select value={draft.team || "_none"} onValueChange={(v) => setDraft({ ...draft, team: v === "_none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— None —</SelectItem>
              {teams.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Title">
        <Input value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </Field>
      <Field label="Role">
        <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v as Role })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Notes (optional)">
        <Textarea rows={3} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function UserDetails({ user }: { user: User }) {
  const data = useData();
  const stats = userStats(user);

  const activity: TimelineEntry[] = useMemo(() => {
    return data.activity
      .filter((a) => a.message.toLowerCase().includes(user.username.toLowerCase()) || a.entityId === user.id)
      .slice(0, 8)
      .map((a) => ({ id: a.id, title: a.message, timestamp: a.createdAt, icon: ShieldCheck, tone: "info" as const }));
  }, [data.activity, user]);

  const tickets = data.tickets.filter((t) => t.assignee === user.username || t.requester === user.username).slice(0, 6);
  const tasks = data.tasks.filter((t) => t.assignedTo === user.username || t.owner === user.username).slice(0, 6);
  const docs = data.documents.filter((d) => d.owner === user.username).slice(0, 6);

  return (
    <div className="space-y-5">
      <SectionCard title="Profile">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Info icon={Mail} label="Email" value={user.email} />
          <Info icon={Building2} label="Department" value={user.department} />
          <Info icon={Users} label="Team" value={user.team} />
          <Info icon={ShieldCheck} label="Role" value={roleLabel(user.role)} />
        </dl>
      </SectionCard>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBlock icon={Ticket} label="Tickets" value={stats.assignedTickets} />
        <StatBlock icon={CheckSquare} label="Tasks" value={stats.assignedTasks} />
        <StatBlock icon={FileText} label="Documents" value={stats.authoredDocuments} />
        <StatBlock icon={ShieldCheck} label="Notes" value={stats.notes} />
      </div>

      <SectionCard title="Assigned tickets">
        {tickets.length === 0 ? <p className="text-xs text-muted-foreground">No tickets</p> : (
          <ul className="space-y-1.5 text-sm">
            {tickets.map((t) => <li key={t.id} className="flex items-center justify-between gap-2"><span className="truncate">{t.number} — {t.subject}</span><StatusBadge label={t.status} tone="info" /></li>)}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Assigned tasks">
        {tasks.length === 0 ? <p className="text-xs text-muted-foreground">No tasks</p> : (
          <ul className="space-y-1.5 text-sm">
            {tasks.map((t) => <li key={t.id} className="flex items-center justify-between gap-2"><span className="truncate">{t.title}</span><StatusBadge label={t.status} tone="info" /></li>)}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Authored documents">
        {docs.length === 0 ? <p className="text-xs text-muted-foreground">No documents</p> : (
          <ul className="space-y-1.5 text-sm">
            {docs.map((d) => <li key={d.id} className="flex items-center justify-between gap-2"><span className="truncate">{d.title}</span><StatusBadge label={d.status} tone="info" /></li>)}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Activity">
        <ActivityTimeline entries={activity} emptyLabel="No related activity recorded." />
      </SectionCard>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"><Icon className="h-3 w-3" /> {label}</div>
      <div className="mt-0.5 truncate">{value}</div>
    </div>
  );
}

function StatBlock({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"><Icon className="h-3 w-3" /> {label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
