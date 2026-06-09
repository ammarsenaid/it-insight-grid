import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, ShieldCheck, Check, X, Info, Eye, Lock } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import { ROLES, CAPS, CAPABILITY_GROUPS, PAGE_VISIBILITY, can, useRole, setRole, type Role } from "@/lib/permissions";
import { useData } from "@/lib/data/store";
import { roleLabel } from "@/lib/data/users";

export const Route = createFileRoute("/admin/roles")({
  head: () => ({ meta: [{ title: "Roles & Permissions · IT Knowledge Center" }] }),
  component: AdminRolesPage,
});

const PAGES: { path: string; label: string }[] = [
  { path: "/", label: "Dashboard" },
  { path: "/documents", label: "Documents" },
  { path: "/tickets", label: "Tickets" },
  { path: "/my-requests", label: "My Requests" },
  { path: "/service-catalog", label: "Service Catalog" },
  { path: "/cmdb", label: "CMDB" },
  { path: "/ipam", label: "IPAM" },
  { path: "/tasks", label: "Tasks" },
  { path: "/notes", label: "Notes" },
  { path: "/audit", label: "Audit Log" },
  { path: "/reports", label: "Reports" },
  { path: "/admin/users", label: "Users" },
  { path: "/admin/teams", label: "Teams" },
  { path: "/admin/roles", label: "Roles" },
  { path: "/admin/ticket-settings", label: "Ticket Configuration" },
  { path: "/trash", label: "Recycle Bin" },
  { path: "/settings", label: "Settings" },
];

function AdminRolesPage() {
  const role = useRole();
  const allowed = can("admin.roles", role);
  const data = useData();
  const [preview, setPreview] = useState<Role>(role);

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Roles & Permissions" description="Role definitions and permission matrix." />
        <EmptyState icon={Lock} title="Admin access required" description="Switch to the IT Administrator role via the profile menu to view the permission matrix." />
      </div>
    );
  }

  const userCountByRole = (id: Role) => data.users.filter((u) => u.role === id && u.status === "active").length;

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Permission matrix used by the frontend. Backend enforcement (database row-level security) will be added when Lovable Cloud is enabled — these visibility rules are a prototype preview only."
      />

      <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#5B8CFF]/30 bg-[#5B8CFF]/10 p-3 text-xs text-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#5B8CFF]" />
        <div>
          <p className="font-medium">Frontend-only permission preview</p>
          <p className="mt-0.5 text-muted-foreground">All page visibility and action gating below is client-side. Switching role from the profile menu — or using the preview switcher in this page — updates sidebar routes, action buttons and record scopes immediately. Real authentication and database row-level security will be added in a later batch.</p>
        </div>
      </div>

      <Tabs defaultValue="roles" className="space-y-4">
        <TabsList>
          <TabsTrigger value="roles"><KeyRound className="mr-1.5 h-3.5 w-3.5" /> Role list</TabsTrigger>
          <TabsTrigger value="capabilities"><ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Capability matrix</TabsTrigger>
          <TabsTrigger value="pages"><Eye className="mr-1.5 h-3.5 w-3.5" /> Page visibility</TabsTrigger>
          <TabsTrigger value="preview"><Eye className="mr-1.5 h-3.5 w-3.5" /> Role preview</TabsTrigger>
        </TabsList>

        <TabsContent value="roles">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {ROLES.map((r) => {
              const capCount = Object.values(CAPS).filter((list) => list.includes(r.id)).length;
              const pageCount = Object.values(PAGE_VISIBILITY).filter((list) => list.includes(r.id)).length;
              return (
                <SectionCard key={r.id} title={r.label} description={r.description}
                  actions={<StatusBadge label={r.group} tone="info" />}
                >
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <Cell label="Users" value={userCountByRole(r.id)} />
                    <Cell label="Pages" value={pageCount} />
                    <Cell label="Capabilities" value={capCount} />
                  </dl>
                  <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => setPreview(r.id)}>
                    Preview this role
                  </Button>
                </SectionCard>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="capabilities">
          <SectionCard title="Capability matrix" description="Action-level visibility by role. Backend enforcement still pending.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-xs">
                <thead>
                  <tr className="border-b border-border/40 text-left text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Capability</th>
                    {ROLES.map((r) => <th key={r.id} className="px-2 py-2 text-center font-medium">{r.label.split(" ").map((w) => w[0]).join("")}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {CAPABILITY_GROUPS.map((group) => (
                    <Cells key={group.label} group={group} />
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-muted-foreground">Header abbreviations: hover a column header in your imagination — full role labels appear in the Role list tab.</p>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="pages">
          <SectionCard title="Page visibility" description="Which sidebar pages each role can open.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-xs">
                <thead>
                  <tr className="border-b border-border/40 text-left text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Page</th>
                    {ROLES.map((r) => <th key={r.id} className="px-2 py-2 text-center font-medium">{r.label.split(" ").map((w) => w[0]).join("")}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {PAGES.map((p) => (
                    <tr key={p.path} className="border-b border-border/20">
                      <td className="px-2 py-2"><div className="font-medium">{p.label}</div><div className="font-mono text-[10px] text-muted-foreground">{p.path}</div></td>
                      {ROLES.map((r) => {
                        const ok = (PAGE_VISIBILITY[p.path] ?? []).includes(r.id);
                        return <td key={r.id} className="px-2 py-2 text-center">{ok ? <Check className="mx-auto h-3.5 w-3.5 text-[#52D6A4]" /> : <X className="mx-auto h-3.5 w-3.5 text-muted-foreground/50" />}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="preview">
          <SectionCard title="Role preview"
            description="Inspect what a role can see and do, then optionally activate it."
            actions={
              <div className="flex items-center gap-2">
                <select
                  className="rounded-lg border border-border/40 bg-background/40 px-2 py-1 text-xs"
                  value={preview}
                  onChange={(e) => setPreview(e.target.value as Role)}
                >
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <Button size="sm" onClick={() => setRole(preview)}>Activate role</Button>
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visible pages</h3>
                <div className="flex flex-wrap gap-1.5">
                  {PAGES.filter((p) => (PAGE_VISIBILITY[p.path] ?? []).includes(preview)).map((p) => <Badge key={p.path} variant="outline" className="text-[11px]">{p.label}</Badge>)}
                </div>
                <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hidden pages</h3>
                <div className="flex flex-wrap gap-1.5">
                  {PAGES.filter((p) => !(PAGE_VISIBILITY[p.path] ?? []).includes(preview)).map((p) => <Badge key={p.path} variant="outline" className="text-[11px] text-muted-foreground line-through">{p.label}</Badge>)}
                  {PAGES.every((p) => (PAGE_VISIBILITY[p.path] ?? []).includes(preview)) && <span className="text-xs text-muted-foreground">None — full access.</span>}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Allowed actions</h3>
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-2 text-xs">
                  {CAPABILITY_GROUPS.flatMap((g) => g.caps).map((c) => {
                    const ok = can(c.key, preview);
                    return (
                      <div key={c.key} className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-background/40 px-2 py-1.5">
                        <span>{c.label}</span>
                        {ok ? <Check className="h-3.5 w-3.5 text-[#52D6A4]" /> : <X className="h-3.5 w-3.5 text-muted-foreground/50" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Currently active role: <strong>{roleLabel(role)}</strong>. Activating a different role updates the sidebar, top header, and module pages immediately.
            </p>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Cells({ group }: { group: { label: string; caps: { key: string; label: string }[] } }) {
  return (
    <>
      <tr className="bg-muted/30">
        <td colSpan={1 + ROLES.length} className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</td>
      </tr>
      {group.caps.map((c) => (
        <tr key={c.key} className="border-b border-border/20">
          <td className="px-2 py-2">{c.label}</td>
          {ROLES.map((r) => {
            const ok = (CAPS[c.key] ?? []).includes(r.id);
            return <td key={r.id} className="px-2 py-2 text-center">{ok ? <Check className="mx-auto h-3.5 w-3.5 text-[#52D6A4]" /> : <X className="mx-auto h-3.5 w-3.5 text-muted-foreground/40" />}</td>;
          })}
        </tr>
      ))}
    </>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold">{value}</div>
    </div>
  );
}
