import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Send, Lock, Inbox } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { timeAgo } from "@/components/common/format";
import { useData } from "@/lib/data/store";
import { useRole, can } from "@/lib/permissions";
import {
  intakeEmail,
  updateMailboxSettings,
  labelSource,
  TICKET_CATEGORIES,
  TICKET_TEAMS,
  TICKET_PRIORITIES,
} from "@/lib/data/tickets";
import type { TicketPriority, UnknownRequesterFallback } from "@/lib/data/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin/mailbox")({
  head: () => ({ meta: [{ title: "Mailbox Simulator · IT Knowledge Center" }] }),
  component: MailboxAdmin,
});

const FALLBACKS: { value: UnknownRequesterFallback; label: string; help: string }[] = [
  { value: "create_temp", label: "Create temporary requester", help: "Open ticket under a guest identity tied to the sender email." },
  { value: "assign_fallback", label: "Assign to fallback requester", help: "Use the configured fallback employee as the requester." },
  { value: "flag_review", label: "Flag for review", help: "Create a ticket but mark it as needing manual reassignment." },
  { value: "ignore", label: "Ignore email", help: "Drop the message silently and log to activity." },
];

function MailboxAdmin() {
  const data = useData();
  const role = useRole();
  const allowed = can("tickets.config", role);
  const mailbox = data.ticketSettings.mailbox;

  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Mailbox Simulator" description="Configure inbound email and simulate incoming messages." />
        <EmptyState icon={Lock} title="Admin access required" description="Switch to the IT Administrator role to manage mailbox intake." />
      </div>
    );
  }

  const recentEmail = data.tickets.filter((t) => t.source === "email").slice(0, 8);

  const send = () => {
    const cleaned = from.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      toast.error("Enter a valid sender email");
      return;
    }
    if (!subject.trim() && !body.trim()) {
      toast.error("Add a subject or body before sending");
      return;
    }
    const res = intakeEmail({ fromEmail: cleaned, subject, body });
    if (res.outcome === "ignored") {
      toast.message("Email ignored", { description: res.reason });
    } else {
      toast.success(`Ticket ${res.ticket.number} created (${res.outcome})`, {
        description: res.matchedRequester ? `Matched ${res.matchedRequester}` : "Unknown sender fallback applied",
      });
    }
    setSubject("");
    setBody("");
  };

  return (
    <div>
      <PageHeader
        title="Mailbox Simulator"
        description="Configure the inbound IT mailbox and simulate emails to see how they convert into tickets."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Mailbox configuration">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 p-3">
              <div className="text-xs">
                <div className="font-medium">Mailbox enabled</div>
                <p className="text-muted-foreground">When off, incoming emails are dropped and no tickets are created.</p>
              </div>
              <Switch checked={mailbox.enabled} onCheckedChange={(v) => updateMailboxSettings({ enabled: v })} />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Inbound address</Label>
              <Input value={mailbox.address} onChange={(e) => updateMailboxSettings({ address: e.target.value })} placeholder="it-support@company.local" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Unknown sender behavior</Label>
              <Select value={mailbox.unknownFallback} onValueChange={(v) => updateMailboxSettings({ unknownFallback: v as UnknownRequesterFallback })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FALLBACKS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{FALLBACKS.find((f) => f.value === mailbox.unknownFallback)?.help}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Fallback requester</Label>
              <Input value={mailbox.fallbackRequester} onChange={(e) => updateMailboxSettings({ fallbackRequester: e.target.value })} placeholder="username" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Default category</Label>
                <Select value={mailbox.defaultCategory} onValueChange={(v) => updateMailboxSettings({ defaultCategory: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TICKET_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Default team</Label>
                <Select value={mailbox.defaultTeam} onValueChange={(v) => updateMailboxSettings({ defaultTeam: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TICKET_TEAMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Default priority</Label>
                <Select value={mailbox.defaultPriority} onValueChange={(v) => updateMailboxSettings({ defaultPriority: v as TicketPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Simulate inbound email">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">From</Label>
              <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="alice@company.local" />
              <p className="text-[11px] text-muted-foreground">Matches users by email. Try a known address or an unknown one to see fallback behavior.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Cannot connect to VPN" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Body</Label>
              <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Describe the issue as the sender would…" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={send} disabled={!mailbox.enabled}>
                <Send className="mr-1.5 h-4 w-4" /> Deliver email
              </Button>
              <Button variant="ghost" onClick={() => { setFrom("alice.morgan@company.local"); setSubject("Outlook keeps crashing"); setBody("Since this morning Outlook crashes when I open shared calendars."); }}>
                Fill known sender
              </Button>
              <Button variant="ghost" onClick={() => { setFrom("vendor@external.com"); setSubject("Quote attached"); setBody("Please find the renewal quote attached."); }}>
                Fill unknown sender
              </Button>
            </div>
            {!mailbox.enabled && <p className="text-[11px] text-[#FFC86B]">Mailbox is disabled — delivery is blocked.</p>}
          </div>
        </SectionCard>

        <SectionCard title="Recent email tickets" className="lg:col-span-2">
          {recentEmail.length === 0 ? (
            <p className="text-xs text-muted-foreground">No email-sourced tickets yet. Use the simulator above to create one.</p>
          ) : (
            <div className="space-y-2">
              {recentEmail.map((t) => (
                <Link key={t.id} to="/tickets/$id" params={{ id: t.id }} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/30 px-3 py-2 text-xs transition-colors hover:bg-white/[0.03]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-primary">{t.number}</span>
                      <StatusBadge label={labelSource(t.source)} tone="info" />
                      {t.sourceFlagged && <StatusBadge label="Review" tone="warning" />}
                    </div>
                    <div className="mt-0.5 truncate font-medium">{t.subject}</div>
                    <div className="truncate text-[11px] text-muted-foreground">From: {t.sourceEmail ?? "—"} · Requester: {t.requester}</div>
                  </div>
                  <span className="text-[10px] text-muted-foreground" suppressHydrationWarning>{timeAgo(t.createdAt)}</span>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
