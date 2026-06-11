import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, Route as RouteIcon, Tag, Users as UsersIcon, Lock, MessageSquare } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useRole, can } from "@/lib/permissions";
import {
  ticketCategoriesQuery,
  ticketPriorityConfigsQuery,
  slaPoliciesQuery,
  routingRulesQuery,
  cannedResponsesQuery,
} from "@/lib/service-desk/queries";

export const Route = createFileRoute("/admin/ticket-settings")({
  head: () => ({ meta: [{ title: "Ticket Configuration · IT Knowledge Center" }] }),
  component: TicketSettings,
});

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " "); }

function TicketSettings() {
  const { session } = useAuth();
  const role = useRole();
  const allowed = can("tickets.config", role);
  const enabled = Boolean(session?.user?.id) && allowed;

  const { data: categories = [] } = useQuery({ ...ticketCategoriesQuery(), enabled });
  const { data: priorities = [] } = useQuery({ ...ticketPriorityConfigsQuery(), enabled });
  const { data: slas = [] } = useQuery({ ...slaPoliciesQuery(), enabled });
  const { data: rules = [] } = useQuery({ ...routingRulesQuery(), enabled });
  const { data: canned = [] } = useQuery({ ...cannedResponsesQuery(), enabled });

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Ticket Configuration" description="Categories, priorities, SLA policies, routing rules, and canned responses." />
        <EmptyState icon={Lock} title="Admin access required" description="You need the tickets.config permission to manage ticket configuration." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Ticket Configuration"
        description="Read the live ticket configuration. Inline editing is not available in this version."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title={`Categories (${categories.length})`}>
          {categories.length === 0 ? (
            <p className="text-xs text-muted-foreground">No categories configured.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <StatusBadge key={c.id} label={c.name} tone={c.isActive ? "muted" : "default"} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={`Priorities (${priorities.length})`}>
          {priorities.length === 0 ? (
            <p className="text-xs text-muted-foreground">No priorities configured.</p>
          ) : (
            <div className="space-y-1.5">
              {priorities.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 px-3 py-1.5 text-xs">
                  <span className="inline-flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5" style={{ color: p.color || undefined }} />
                    <span className="capitalize">{p.name}</span>
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {p.responseTargetMinutes ?? "—"}m / {p.resolutionTargetMinutes ?? "—"}m
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={`SLA policies (${slas.length})`} className="lg:col-span-2">
          {slas.length === 0 ? (
            <p className="text-xs text-muted-foreground">No SLA policies configured.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Policy</th>
                    <th className="px-3 py-2 text-left">Priority</th>
                    <th className="px-3 py-2 text-left">Response</th>
                    <th className="px-3 py-2 text-left">Resolution</th>
                    <th className="px-3 py-2 text-left">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {slas.map((p) => (
                    <tr key={p.id} className="border-t border-border/40">
                      <td className="px-3 py-2">{p.name}</td>
                      <td className="px-3 py-2"><StatusBadge label={cap(p.priorityKey)} tone={p.priorityKey === "critical" ? "danger" : p.priorityKey === "high" ? "warning" : p.priorityKey === "low" ? "muted" : "info"} /></td>
                      <td className="px-3 py-2"><AlarmClock className="mr-1 inline h-3 w-3 text-muted-foreground" />{p.responseMinutes} min</td>
                      <td className="px-3 py-2"><AlarmClock className="mr-1 inline h-3 w-3 text-muted-foreground" />{Math.round(p.resolutionMinutes / 60)} h</td>
                      <td className="px-3 py-2">{p.isActive ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title={`Routing rules (${rules.length})`} className="lg:col-span-2">
          {rules.length === 0 ? (
            <p className="text-xs text-muted-foreground">No routing rules configured.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Order</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Match</th>
                    <th className="px-3 py-2 text-left">Action</th>
                    <th className="px-3 py-2 text-left">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id} className="border-t border-border/40">
                      <td className="px-3 py-2 font-mono">{r.priorityOrder}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{JSON.stringify(r.matchWhen)}</td>
                      <td className="px-3 py-2 font-mono text-[10px]"><RouteIcon className="mr-1 inline h-3 w-3 text-muted-foreground" />{JSON.stringify(r.action)}</td>
                      <td className="px-3 py-2">{r.isActive ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title={`Canned responses (${canned.length})`} className="lg:col-span-2">
          {canned.length === 0 ? (
            <p className="text-xs text-muted-foreground">No canned responses configured.</p>
          ) : (
            <div className="space-y-2">
              {canned.map((c) => (
                <div key={c.id} className="rounded-lg border border-border/40 bg-background/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      <code className="font-mono text-[11px] text-primary">/{c.shortcut}</code>
                      <span className="font-medium">{c.title}</span>
                    </div>
                    {c.isInternal && <Badge variant="outline" className="text-[10px]">Internal</Badge>}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{c.body}</p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            <UsersIcon className="mr-1 inline h-3 w-3" /> CRUD for canned responses lives on the dedicated Templates page.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
