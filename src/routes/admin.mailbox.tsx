import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock, Mail } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useRole, can } from "@/lib/permissions";
import { mailboxConfigsQuery } from "@/lib/service-desk/queries";

export const Route = createFileRoute("/admin/mailbox")({
  head: () => ({ meta: [{ title: "Mailbox · IT Knowledge Center" }] }),
  component: MailboxAdmin,
});

function MailboxAdmin() {
  const { session } = useAuth();
  const role = useRole();
  const allowed = can("tickets.config", role);
  const enabled = Boolean(session?.user?.id) && allowed;

  const { data: configs = [], isLoading, isError, error } = useQuery({
    ...mailboxConfigsQuery(),
    enabled,
  });

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Mailbox" description="Configure inbound email intake." />
        <EmptyState icon={Lock} title="Admin access required" description="You need the tickets.config permission to manage mailbox configuration." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Mailbox"
        description="Configured inbound mailboxes. Read-only in this version."
      />

      <SectionCard title={`Mailbox configurations (${configs.length})`}>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : isError ? (
          <p className="text-xs text-[#FF7C91]">{error instanceof Error ? error.message : "Failed to load mailbox configs."}</p>
        ) : configs.length === 0 ? (
          <EmptyState icon={Mail} title="No mailboxes configured" description="Add mailbox configs in the database to receive inbound email." />
        ) : (
          <div className="space-y-2">
            {configs.map((c) => (
              <div key={c.id} className="rounded-lg border border-border/40 bg-background/30 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{c.name}</span>
                    {!c.isActive && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                  </div>
                </div>
                <div className="mt-1 grid grid-cols-1 gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                  <span>Inbound: <code className="font-mono">{c.inboundAddress}</code></span>
                  <span>Outbound: <code className="font-mono">{c.outboundFrom ?? "—"}</code></span>
                  <span>Reply-to: <code className="font-mono">{c.replyTo ?? "—"}</code></span>
                  <span>Default category: {c.defaultCategory ?? "—"}</span>
                  <span>Default priority: {c.defaultPriority}</span>
                  <span>Default team: {c.defaultTeam ?? "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
