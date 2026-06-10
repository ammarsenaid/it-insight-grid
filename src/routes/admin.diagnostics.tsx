import { createFileRoute, Link } from "@tanstack/react-router";
import { Database, FileText, Inbox, RefreshCw, Ticket, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { refreshFromStorage, useData } from "@/lib/data/store";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/admin/diagnostics")({
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
  const data = useData();
  const { isPlatformAdmin } = useAuth();

  if (!isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-2xl">
        <SectionCard title="Diagnostics">
          <p className="text-sm text-muted-foreground">
            This area is restricted to platform administrators.
          </p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diagnostics"
        description="Internal developer and operations tools."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Workspace status" description="Local environment health">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2 text-emerald-300">
              <FileText className="h-3.5 w-3.5" /> Knowledge backend connected
            </li>
            <li className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-2">
                <Ticket className="h-3.5 w-3.5" /> Tickets in local store
              </span>
              <span className="font-mono text-foreground/80">{data.tickets.length}</span>
            </li>
            <li className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-2">
                <Trash2 className="h-3.5 w-3.5" /> Recycle bin entries
              </span>
              <span className="font-mono text-foreground/80">{data.trash.length}</span>
            </li>
          </ul>
          <Button
            size="sm"
            variant="secondary"
            className="mt-4"
            onClick={() => {
              refreshFromStorage();
              toast.success("Local data refreshed");
            }}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh local data
          </Button>
        </SectionCard>

        <SectionCard title="Developer tools" description="Restricted utilities for QA and support">
          <ul className="space-y-2 text-sm">
            <li>
              <Link
                to="/admin/mailbox"
                className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-3 py-2 hover:bg-card/70"
              >
                <Inbox className="h-4 w-4 text-primary" />
                <span className="flex-1">Mailbox Simulator</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  QA tool
                </span>
              </Link>
            </li>
            <li className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-3 py-2 text-muted-foreground">
              <Database className="h-4 w-4" />
              <span className="flex-1">Knowledge backend</span>
              <span className="text-[10px] uppercase tracking-wider text-emerald-400">
                Connected
              </span>
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
