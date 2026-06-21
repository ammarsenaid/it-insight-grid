import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Info, Loader2, Lock, Mail } from "lucide-react";

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

  const {
    data: configs = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    ...mailboxConfigsQuery(),
    enabled,
  });

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Mailbox" description="Configure inbound email intake." />
        <EmptyState
          icon={Lock}
          title="Admin access required"
          description="You need the tickets.config permission to manage mailbox configuration."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Mailbox"
        description="Review inbound email channels, sender identities, and ticket routing defaults."
      />

      <div className="flex items-start gap-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-xs text-muted-foreground shadow-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
        <div>
          <p className="font-semibold text-foreground">Read-only configuration</p>
          <p className="mt-0.5">
            Mailbox settings shown here reflect the current inbound email configuration.
          </p>
        </div>
      </div>

      <SectionCard
        title={`Mailbox configurations (${configs.length})`}
        className="border-border/50 shadow-sm"
      >
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading mailbox configurations…
          </div>
        ) : isError ? (
          <div
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error instanceof Error ? error.message : "Failed to load mailbox configs."}
          </div>
        ) : configs.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No mailboxes configured"
            description="Add mailbox configs in the database to receive inbound email."
          />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {configs.map((c) => (
              <article
                key={c.id}
                className="overflow-hidden rounded-xl border border-border/50 bg-background/30 shadow-sm transition-colors hover:border-border"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-muted/20 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Mail className="h-4 w-4" />
                    </span>
                    <span className="truncate text-sm font-semibold">{c.name}</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      c.isActive
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        : "text-muted-foreground"
                    }
                  >
                    {c.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 text-xs sm:grid-cols-2">
                  <MailboxField label="Inbound" value={c.inboundAddress} mono />
                  <MailboxField label="Outbound" value={c.outboundFrom ?? "—"} mono />
                  <MailboxField label="Reply-to" value={c.replyTo ?? "—"} mono />
                  <MailboxField label="Default category" value={c.defaultCategory ?? "—"} />
                  <MailboxField label="Default priority" value={c.defaultPriority} />
                  <MailboxField label="Default team" value={c.defaultTeam ?? "—"} />
                </dl>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function MailboxField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-1 truncate text-foreground ${mono ? "font-mono text-[10px]" : "font-medium"}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
