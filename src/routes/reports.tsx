import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Ticket,
  Server,
  Network,
  BookOpen,
  CheckSquare,
  ListChecks,
  ArrowUpRight,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports · IT Knowledge Center" }] }),
  beforeLoad: () => {
    if (!can("reports.view")) throw redirect({ to: "/" });
  },
  component: ReportsPage,
});

type ModuleLink = {
  label: string;
  to: string;
  description: string;
  icon: typeof BarChart3;
};

const MODULES: ModuleLink[] = [
  { label: "Tickets", to: "/tickets", description: "Queue, SLA and assignment overview.", icon: Ticket },
  { label: "Tasks", to: "/tasks", description: "Open work, due dates, ownership.", icon: CheckSquare },
  { label: "Protocols", to: "/protocols", description: "Active runs and approvals.", icon: ListChecks },
  { label: "CMDB", to: "/cmdb", description: "Asset inventory and status.", icon: Server },
  { label: "IPAM", to: "/ipam", description: "IP utilization and allocations.", icon: Network },
  { label: "Knowledge", to: "/documents", description: "Books, chapters and pages.", icon: BookOpen },
];

function ReportsPage() {
  return (
    <div>
      <PageHeader
        title="Reports"
        description="Cross-module reporting for tickets, tasks, infrastructure, and knowledge."
      />

      <section className="glass-card mt-2 flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <BarChart3 className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Reporting setup required</h2>
        <p className="max-w-lg text-sm text-muted-foreground">
          Consolidated reporting is not enabled in this environment yet. In the
          meantime, open each module directly to review live operational data.
        </p>
      </section>

      <section className="mt-6">
        <h3 className="mb-3 text-sm font-semibold tracking-tight">Open a module</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <ModuleCard key={m.to} {...m} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ModuleCard({ label, to, description, icon: Icon }: ModuleLink) {
  return (
    <Link
      to={to}
      className="glass-card group flex flex-col gap-3 rounded-2xl p-5 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center justify-between">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="mt-auto">
        <Button size="sm" variant="ghost" asChild>
          <span>Open {label}</span>
        </Button>
      </div>
    </Link>
  );
}
