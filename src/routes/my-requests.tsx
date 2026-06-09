import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Inbox, Plus, CheckCircle2, Clock, AlertTriangle, ShoppingBag, Bell, Eye } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { SectionCard } from "@/components/common/SectionCard";
import { EmptyState } from "@/components/common/EmptyState";
import { FilterBar } from "@/components/common/FilterBar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FormDrawer } from "@/components/common/FormDrawer";
import { timeAgo } from "@/components/common/format";
import { useData } from "@/lib/data/store";
import { createTicket, currentRequesterFor, recomputeSla, slaLabel, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_TYPES } from "@/lib/data/tickets";
import { useRole } from "@/lib/permissions";
import type { Ticket, TicketPriority } from "@/lib/data/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/my-requests")({
  head: () => ({ meta: [{ title: "My Requests · IT Knowledge Center" }] }),
  component: MyRequests,
});

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " "); }

function MyRequests() {
  const data = useData();
  const role = useRole();
  const requester = currentRequesterFor(role);
  const [tab, setTab] = useState("open");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const mine = useMemo(
    () => data.tickets.filter((t) => t.requester === requester).map(recomputeSla),
    [data.tickets, requester],
  );
  const open = mine.filter((t) => !["resolved", "closed", "cancelled"].includes(t.status));
  const resolved = mine.filter((t) => t.status === "resolved" || t.status === "closed");
  const waiting = mine.filter((t) => t.status === "waiting");

  const tabbed = tab === "open" ? open : tab === "resolved" ? resolved : tab === "waiting" ? waiting : mine;
  const filtered = tabbed.filter((t) => !query.trim() || t.subject.toLowerCase().includes(query.toLowerCase()) || t.number.toLowerCase().includes(query.toLowerCase()));

  const myNotifications = data.notifications.slice(0, 6);

  return (
    <div>
      <PageHeader
        title="My Requests"
        description={`Requests opened by ${requester}. Switch roles via the profile menu to see different perspectives.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/service-catalog"><Button variant="secondary"><ShoppingBag className="mr-1.5 h-4 w-4" /> Browse catalog</Button></Link>
            <Button onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> New request</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard icon={Inbox} label="Open" value={open.length} accent="primary" />
        <MetricCard icon={Clock} label="Waiting on you" value={waiting.length} accent="warning" />
        <MetricCard icon={CheckCircle2} label="Resolved" value={resolved.length} accent="success" />
        <MetricCard icon={AlertTriangle} label="Total" value={mine.length} accent="muted" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="open">Open ({open.length})</TabsTrigger>
              <TabsTrigger value="waiting">Waiting ({waiting.length})</TabsTrigger>
              <TabsTrigger value="resolved">Resolved ({resolved.length})</TabsTrigger>
              <TabsTrigger value="all">All ({mine.length})</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-3">
              <FilterBar query={query} onQueryChange={setQuery} placeholder="Search your requests…" />
              {filtered.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title={mine.length === 0 ? "No requests yet" : "Nothing here"}
                  description={mine.length === 0 ? "Submit your first request to track its progress." : "Try a different tab or search."}
                  actionLabel={mine.length === 0 ? "New request" : undefined}
                  onAction={mine.length === 0 ? () => setCreateOpen(true) : undefined}
                />
              ) : (
                <div className="space-y-2">
                  {filtered.map((t) => <RequestCard key={t.id} t={t} />)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <SectionCard title="Notifications">
            {myNotifications.length === 0 && <p className="text-xs text-muted-foreground">No notifications.</p>}
            <div className="space-y-2">
              {myNotifications.map((n) => (
                <div key={n.id} className="rounded-xl border border-border/40 bg-background/30 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{n.title}</span>
                    <StatusBadge label={n.type} tone={n.type === "danger" ? "danger" : n.type === "warning" ? "warning" : n.type === "success" ? "success" : "info"} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{n.message}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground" suppressHydrationWarning>{timeAgo(n.createdAt)}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Quick help">
            <p className="text-xs text-muted-foreground">Frequently requested items:</p>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {data.catalog.slice(0, 4).map((c) => (
                <Link key={c.id} to="/service-catalog/$id" params={{ id: c.id }} className="rounded-lg border border-border/40 bg-background/30 px-2 py-1.5 text-xs transition-colors hover:bg-white/[0.03]">
                  {c.name}
                </Link>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <RequesterCreateDrawer open={createOpen} onOpenChange={setCreateOpen} requester={requester} />
    </div>
  );
}

function RequestCard({ t }: { t: Ticket }) {
  const sla = slaLabel(t);
  return (
    <Link to="/tickets/$id" params={{ id: t.id }} className="glass-card block rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-primary">{t.number}</span>
            <StatusBadge label={t.status === "in_progress" ? "In progress" : cap(t.status)} tone={t.status === "resolved" ? "success" : t.status === "waiting" ? "muted" : "info"} />
            <StatusBadge label={cap(t.priority)} tone={t.priority === "critical" ? "danger" : t.priority === "high" ? "warning" : t.priority === "low" ? "muted" : "info"} />
            <StatusBadge label={sla.label} tone={sla.tone} />
          </div>
          <div className="mt-1 truncate text-sm font-medium">{t.subject}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{t.category}{t.subcategory && " · " + t.subcategory}</div>
        </div>
        <div className="text-right text-[10px] text-muted-foreground">
          <div suppressHydrationWarning>Updated {timeAgo(t.updatedAt)}</div>
          <Eye className="mt-1 ml-auto h-3.5 w-3.5" />
        </div>
      </div>
    </Link>
  );
}

function RequesterCreateDrawer({ open, onOpenChange, requester }: { open: boolean; onOpenChange: (o: boolean) => void; requester: string }) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(TICKET_CATEGORIES[0]);
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [type, setType] = useState<typeof TICKET_TYPES[number]>("request");

  const reset = () => { setSubject(""); setDescription(""); setCategory(TICKET_CATEGORIES[0]); setPriority("normal"); setType("request"); };

  return (
    <FormDrawer
      open={open}
      onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}
      title="Submit a new request"
      description="The IT team will pick this up shortly and respond inside this portal."
      submitLabel="Submit request"
      onSubmit={() => {
        if (subject.trim().length < 4) return toast.error("Subject too short");
        if (description.trim().length < 8) return toast.error("Please describe the issue (at least 8 characters)");
        const t = createTicket({
          requester, subject: subject.trim(), description: description.trim(),
          type, category, priority, team: "Service Desk", tags: ["self-service"],
        });
        toast.success(`Request ${t.number} submitted`, { description: "You'll be notified when IT responds." });
        reset();
        onOpenChange(false);
      }}
    >
      <div className="space-y-2"><Label className="text-xs">Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" /></div>
      <div className="space-y-2"><Label className="text-xs">Description</Label><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Please describe the issue or request" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as typeof TICKET_TYPES[number])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TICKET_TYPES.map((t) => <SelectItem key={t} value={t}>{cap(t)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label className="text-xs">Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{cap(p)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-2"><Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TICKET_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Mock attachments can be added on the ticket detail page after submission.</p>
    </FormDrawer>
  );
}
