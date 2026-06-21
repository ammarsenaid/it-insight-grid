import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  CircleAlert,
  Info,
  Route as RouteIcon,
  Tag,
  Users as UsersIcon,
  Lock,
  MessageSquare,
} from "lucide-react";

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
  head: () => ({ meta: [{ title: "Ticket Configuration Overview · IT Knowledge Center" }] }),
  component: TicketSettings,
});

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ");
}

function TicketSettings() {
  const { session } = useAuth();
  const role = useRole();
  const allowed = can("tickets.config", role);
  const enabled = Boolean(session?.user?.id) && allowed;

  const categoriesQueryResult = useQuery({ ...ticketCategoriesQuery(), enabled });
  const prioritiesQueryResult = useQuery({ ...ticketPriorityConfigsQuery(), enabled });
  const slasQueryResult = useQuery({ ...slaPoliciesQuery(), enabled });
  const rulesQueryResult = useQuery({ ...routingRulesQuery(), enabled });
  const cannedQueryResult = useQuery({ ...cannedResponsesQuery(), enabled });

  const categories = categoriesQueryResult.data ?? [];
  const priorities = prioritiesQueryResult.data ?? [];
  const slas = slasQueryResult.data ?? [];
  const rules = rulesQueryResult.data ?? [];
  const canned = cannedQueryResult.data ?? [];
  const configError = [
    categoriesQueryResult,
    prioritiesQueryResult,
    slasQueryResult,
    rulesQueryResult,
    cannedQueryResult,
  ].some((query) => query.isError);

  if (!allowed) {
    return (
      <div>
        <PageHeader
          title="Ticket Configuration Overview"
          description="Categories, priorities, SLA policies, routing rules, and canned responses."
        />
        <EmptyState
          icon={Lock}
          title="Admin access required"
          description="You need the tickets.config permission to manage ticket configuration."
        />
      </div>
    );
  }

  if (configError) {
    return (
      <div>
        <PageHeader
          title="Ticket Configuration Overview"
          description="Categories, priorities, SLA policies, routing rules, and canned responses."
        />
        <EmptyState
          icon={CircleAlert}
          title="Failed to load ticket configuration"
          description="The configuration service did not return a complete result. Try again before making operational decisions."
          actionLabel="Retry"
          onAction={() => {
            void Promise.all([
              categoriesQueryResult.refetch(),
              prioritiesQueryResult.refetch(),
              slasQueryResult.refetch(),
              rulesQueryResult.refetch(),
              cannedQueryResult.refetch(),
            ]);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Ticket Configuration Overview"
        description="Review the live service desk taxonomy, targets, routing, and agent response standards."
      />

      <div className="flex items-start gap-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-xs text-muted-foreground shadow-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
        <div>
          <p className="font-semibold text-foreground">Live configuration overview</p>
          <p className="mt-0.5 leading-relaxed">
            Values are loaded from the current ticket configuration. Inline editing is not available
            in this view.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title={`Categories (${categories.length})`}
          className="border-border/50 shadow-sm"
        >
          {categories.length === 0 ? (
            <p className="text-xs text-muted-foreground">No categories configured.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <StatusBadge key={c.id} label={c.name} tone={c.isActive ? "muted" : "default"} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={`Priorities (${priorities.length})`}
          className="border-border/50 shadow-sm"
        >
          {priorities.length === 0 ? (
            <p className="text-xs text-muted-foreground">No priorities configured.</p>
          ) : (
            <div className="space-y-2">
              {priorities.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 px-3 py-2.5 text-xs transition-colors hover:bg-muted/20"
                >
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

        <SectionCard
          title={`SLA policies (${slas.length})`}
          className="overflow-hidden border-border/50 shadow-sm lg:col-span-2"
          contentClassName="p-0"
        >
          {slas.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">No SLA policies configured.</p>
          ) : (
            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full min-w-[700px] text-xs">
                <thead className="sticky top-0 z-10 bg-card/95 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">
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
                    <tr
                      key={p.id}
                      className="border-t border-border/40 transition-colors hover:bg-muted/20"
                    >
                      <td className="px-3 py-2">{p.name}</td>
                      <td className="px-3 py-2">
                        <StatusBadge
                          label={cap(p.priorityKey)}
                          tone={
                            p.priorityKey === "critical"
                              ? "danger"
                              : p.priorityKey === "high"
                                ? "warning"
                                : p.priorityKey === "low"
                                  ? "muted"
                                  : "info"
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <AlarmClock className="mr-1 inline h-3 w-3 text-muted-foreground" />
                        {p.responseMinutes} min
                      </td>
                      <td className="px-3 py-2">
                        <AlarmClock className="mr-1 inline h-3 w-3 text-muted-foreground" />
                        {Math.round(p.resolutionMinutes / 60)} h
                      </td>
                      <td className="px-3 py-2">{p.isActive ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={`Routing rules (${rules.length})`}
          className="overflow-hidden border-border/50 shadow-sm lg:col-span-2"
          contentClassName="p-0"
        >
          {rules.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">No routing rules configured.</p>
          ) : (
            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full min-w-[820px] text-xs">
                <thead className="sticky top-0 z-10 bg-card/95 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur">
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
                    <tr
                      key={r.id}
                      className="border-t border-border/40 transition-colors hover:bg-muted/20"
                    >
                      <td className="px-3 py-2 font-mono">{r.priorityOrder}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                        <RuleFields value={r.matchWhen} />
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]">
                        <div className="flex items-start gap-1">
                          <RouteIcon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                          <RuleFields value={r.action} />
                        </div>
                      </td>
                      <td className="px-3 py-2">{r.isActive ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={`Canned responses (${canned.length})`}
          className="border-border/50 shadow-sm lg:col-span-2"
        >
          {canned.length === 0 ? (
            <p className="text-xs text-muted-foreground">No canned responses configured.</p>
          ) : (
            <div className="space-y-2">
              {canned.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-border/40 bg-background/30 p-3.5 transition-colors hover:border-border/70 hover:bg-muted/15"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      <code className="font-mono text-[11px] text-primary">/{c.shortcut}</code>
                      <span className="font-medium">{c.title}</span>
                    </div>
                    {c.isInternal && (
                      <Badge variant="outline" className="text-[10px]">
                        Internal
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{c.body}</p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            <UsersIcon className="mr-1 inline h-3 w-3" /> CRUD for canned responses lives on the
            dedicated Templates page.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}

function RuleFields({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value);
  if (entries.length === 0) return <span>None</span>;

  return (
    <dl className="space-y-1">
      {entries.map(([key, fieldValue]) => (
        <div key={key} className="grid grid-cols-[minmax(80px,auto)_1fr] gap-2">
          <dt className="font-sans font-medium text-muted-foreground">{key.replaceAll("_", " ")}</dt>
          <dd className="break-words">{typeof fieldValue === "string" ? fieldValue : JSON.stringify(fieldValue)}</dd>
        </div>
      ))}
    </dl>
  );
}
