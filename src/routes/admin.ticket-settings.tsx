import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Sliders, AlarmClock, Route as RouteIcon, Tag, Users as UsersIcon, Lock } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { useData } from "@/lib/data/store";
import { useRole, can } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/ticket-settings")({
  head: () => ({ meta: [{ title: "Ticket Configuration · IT Knowledge Center" }] }),
  component: TicketSettings,
});

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " "); }

function TicketSettings() {
  const data = useData();
  const role = useRole();
  const allowed = can("tickets.config", role);
  const s = data.ticketSettings;

  const totalsByPrio = useMemo(() => {
    const m = new Map<string, number>();
    data.tickets.forEach((t) => m.set(t.priority, (m.get(t.priority) ?? 0) + 1));
    return m;
  }, [data.tickets]);

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Ticket Configuration" description="Statuses, priorities, SLA policies, and routing rules." />
        <EmptyState icon={Lock} title="Admin access required" description="Switch to the IT Administrator role via the profile menu to manage ticket configuration." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Ticket Configuration"
        description="Configure statuses, priorities, categories and routing rules."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Statuses">
          <div className="flex flex-wrap gap-1.5">
            {s.statuses.map((st) => <StatusBadge key={st} label={cap(st)} tone="info" />)}
          </div>
        </SectionCard>

        <SectionCard title="Priorities">
          <div className="space-y-1.5">
            {s.priorities.map((p) => (
              <div key={p} className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 px-3 py-1.5 text-xs">
                <span className="inline-flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="capitalize">{p}</span>
                </span>
                <Badge variant="outline" className="text-[10px]">{totalsByPrio.get(p) ?? 0} tickets</Badge>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Categories">
          <div className="flex flex-wrap gap-1.5">
            {s.categories.map((c) => <StatusBadge key={c} label={c} tone="muted" />)}
          </div>
        </SectionCard>

        <SectionCard title="Teams">
          <div className="space-y-1.5">
            {s.teams.map((t) => (
              <div key={t} className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/30 px-3 py-1.5 text-xs">
                <UsersIcon className="h-3.5 w-3.5 text-muted-foreground" />
                {t}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="SLA policies" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Priority</th>
                  <th className="px-3 py-2 text-left">Response target</th>
                  <th className="px-3 py-2 text-left">Resolution target</th>
                </tr>
              </thead>
              <tbody>
                {s.slaPolicies.map((p) => (
                  <tr key={p.id} className="border-t border-border/40">
                    <td className="px-3 py-2"><StatusBadge label={cap(p.priority)} tone={p.priority === "critical" ? "danger" : p.priority === "high" ? "warning" : p.priority === "low" ? "muted" : "info"} /></td>
                    <td className="px-3 py-2"><AlarmClock className="mr-1 inline h-3 w-3 text-muted-foreground" />{p.responseMinutes} minutes</td>
                    <td className="px-3 py-2"><AlarmClock className="mr-1 inline h-3 w-3 text-muted-foreground" />{Math.round(p.resolveMinutes / 60)} hours</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Routing rules" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Routes to team</th>
                </tr>
              </thead>
              <tbody>
                {s.routingRules.map((r) => (
                  <tr key={r.id} className="border-t border-border/40">
                    <td className="px-3 py-2">{r.category}</td>
                    <td className="px-3 py-2"><RouteIcon className="mr-1 inline h-3 w-3 text-muted-foreground" />{r.team}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        <Sliders className="mr-1 inline h-3 w-3" /> Read-only configuration. Inline editing is not available in this version.
      </p>
    </div>
  );
}
