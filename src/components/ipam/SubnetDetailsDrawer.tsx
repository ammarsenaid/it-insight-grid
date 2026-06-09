import { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Network as NetIcon,
  Plus,
  Server,
  Ticket as TicketIcon,
} from "lucide-react";
import { DetailsDrawer } from "@/components/common/DetailsDrawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, statusTone } from "@/components/common/StatusBadge";
import { ActivityTimeline } from "@/components/common/ActivityTimeline";
import { EmptyState } from "@/components/common/EmptyState";
import { logActivity, setState, uid, useData } from "@/lib/data/store";
import { createTicket } from "@/lib/data/tickets";
import { can, useRole } from "@/lib/permissions";
import type { IPAMEntry, Task } from "@/lib/data/types";
import { toast } from "sonner";

export function SubnetDetailsDrawer({
  subnet,
  onOpenChange,
}: {
  subnet: string | null;
  onOpenChange: (o: boolean) => void;
}) {
  const data = useData();
  const role = useRole();
  const writable = can("ipam.write", role);

  const entries = useMemo(
    () => (subnet ? data.ipam.filter((i) => i.subnet === subnet) : []),
    [data.ipam, subnet],
  );

  const used = entries.filter((e) => e.status === "used").length;
  const free = entries.filter((e) => e.status === "free").length;
  const reserved = entries.filter((e) => e.status === "reserved").length;
  const total = used + free + reserved;
  const util = total > 0 ? Math.round((used / total) * 100) : 0;
  const gateway = entries[0]?.gateway ?? "—";
  const vlan = entries[0]?.vlan ?? "—";
  const location = entries[0]?.location ?? "—";

  const dupeMap = new Map<string, IPAMEntry[]>();
  entries.forEach((e) => {
    const arr = dupeMap.get(e.ipAddress) ?? [];
    arr.push(e);
    dupeMap.set(e.ipAddress, arr);
  });
  const conflicts = Array.from(dupeMap.entries()).filter(([, list]) => list.length > 1);

  const linkedAssetIds = new Set(entries.map((e) => e.linkedAssetId).filter(Boolean) as string[]);
  const linkedAssets = data.assets.filter((a) => linkedAssetIds.has(a.id));
  const linkedTickets = data.tickets.filter(
    (t) => t.linkedIpamId && entries.some((e) => e.id === t.linkedIpamId),
  );
  const linkedDocs = data.documents.filter((d) =>
    entries.some((e) => d.relations?.ipamIds?.includes(e.id)),
  );

  const activity = data.activity
    .filter((a) => a.message.includes(subnet ?? "###"))
    .slice(0, 25)
    .map((a) => ({ id: a.id, title: a.message, timestamp: a.createdAt, tone: "info" as const }));

  if (!subnet) return null;

  const reserveNext = () => {
    const freeEntry = entries.find((e) => e.status === "free");
    if (!freeEntry) {
      toast.error("No free addresses in this subnet");
      return;
    }
    setState((s) => ({
      ...s,
      ipam: s.ipam.map((i) =>
        i.id === freeEntry.id ? { ...i, status: "reserved", updatedAt: new Date().toISOString() } : i,
      ),
    }));
    logActivity("ipam.reserve", `Reserved ${freeEntry.ipAddress} in ${subnet}`, "ipam", freeEntry.id);
    toast.success(`Reserved ${freeEntry.ipAddress}`);
  };

  const createSubnetTicket = () => {
    const t = createTicket({
      requester: "system.user",
      subject: `Subnet review — ${subnet}`,
      description: `Operational review for subnet ${subnet} (${vlan}). Utilization: ${util}%.`,
      type: "request",
      category: "Network",
      priority: util > 90 ? "high" : "normal",
    });
    toast.success(`Created ${t.number}`);
  };

  const createSubnetTask = () => {
    const task: Task = {
      id: uid("tsk"),
      title: `Audit subnet ${subnet}`,
      category: "Network",
      priority: "normal",
      status: "open",
      assignedTo: "netops",
      notes: `${vlan} · GW ${gateway} · Utilization ${util}%`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setState((s) => ({ ...s, tasks: [task, ...s.tasks] }));
    logActivity("task.create", `Created task '${task.title}'`, "task", task.id);
    toast.success("Task created");
  };

  return (
    <DetailsDrawer
      open={!!subnet}
      onOpenChange={onOpenChange}
      title={subnet}
      description={`${vlan} · Gateway ${gateway} · ${location}`}
      footer={
        writable && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={reserveNext}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Reserve next free
            </Button>
            <Button size="sm" variant="outline" onClick={createSubnetTicket}>
              <TicketIcon className="mr-1.5 h-3.5 w-3.5" /> Create ticket
            </Button>
            <Button size="sm" variant="outline" onClick={createSubnetTask}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Create task
            </Button>
          </div>
        )
      }
    >
      <div className="mb-4 rounded-2xl border border-border/40 bg-background/40 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Utilization</div>
          <div className="text-sm font-semibold">{util}%</div>
        </div>
        <Progress value={util} className="mt-2 h-1.5" />
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <Stat label="Used" value={used} tone="success" />
          <Stat label="Free" value={free} tone="muted" />
          <Stat label="Reserved" value={reserved} tone="warning" />
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#FF7C91]/30 bg-[#FF7C91]/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-[#FF7C91]" />
          <div>
            <div className="font-medium text-[#FF7C91]">{conflicts.length} duplicate IP{conflicts.length === 1 ? "" : "s"} detected</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {conflicts.slice(0, 3).map(([ip]) => ip).join(", ")}
              {conflicts.length > 3 && ` +${conflicts.length - 3} more`}
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="addresses">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="addresses">Addresses</TabsTrigger>
          <TabsTrigger value="assets">
            Assets {linkedAssets.length > 0 && <Pill n={linkedAssets.length} />}
          </TabsTrigger>
          <TabsTrigger value="tickets">
            Tickets {linkedTickets.length > 0 && <Pill n={linkedTickets.length} />}
          </TabsTrigger>
          <TabsTrigger value="docs">
            Docs {linkedDocs.length > 0 && <Pill n={linkedDocs.length} />}
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="addresses">
          <ul className="divide-y divide-border/30 rounded-xl border border-border/40">
            {entries.map((e) => {
              const isDup = (dupeMap.get(e.ipAddress)?.length ?? 0) > 1;
              return (
                <li key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-mono">
                      {e.ipAddress}
                      {isDup && <AlertTriangle className="h-3 w-3 text-[#FF7C91]" />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{e.hostname || "—"} · {e.type}</div>
                  </div>
                  <StatusBadge tone={statusTone(e.status)} label={e.status} />
                </li>
              );
            })}
          </ul>
          {reserved > 0 && (
            <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              Reserved ranges: {entries.filter((e) => e.status === "reserved").map((e) => e.ipAddress).join(", ")}
            </div>
          )}
        </TabsContent>

        <TabsContent value="assets">
          {linkedAssets.length === 0 ? (
            <EmptyState icon={Server} title="No linked CMDB assets" description="Link IPs to CMDB to populate this list." />
          ) : (
            <ul className="divide-y divide-border/30 rounded-xl border border-border/40">
              {linkedAssets.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{a.hostname}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.role || a.assetType}</div>
                  </div>
                  <StatusBadge tone={statusTone(a.status)} label={a.status} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="tickets">
          {linkedTickets.length === 0 ? (
            <EmptyState icon={TicketIcon} title="No related tickets" description="Create one from the footer actions." />
          ) : (
            <ul className="divide-y divide-border/30 rounded-xl border border-border/40">
              {linkedTickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.number} · {t.subject}</div>
                    <div className="text-xs text-muted-foreground">{t.priority}</div>
                  </div>
                  <StatusBadge tone={statusTone(t.status)} label={t.status} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="docs">
          {linkedDocs.length === 0 ? (
            <EmptyState icon={FileText} title="No linked documents" description="Use Documents → Relations to link runbooks." />
          ) : (
            <ul className="divide-y divide-border/30 rounded-xl border border-border/40">
              {linkedDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="truncate font-medium">{d.title || d.name}</div>
                  <StatusBadge tone={statusTone(d.status)} label={d.status} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="activity">
          <ActivityTimeline entries={activity} emptyLabel="No activity for this subnet." />
        </TabsContent>
      </Tabs>
    </DetailsDrawer>
  );
}

function Pill({ n }: { n: number }) {
  return (
    <Badge variant="outline" className="ml-1.5 h-4 border-primary/40 bg-primary/15 px-1 text-[9px] font-bold text-primary">
      {n}
    </Badge>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "success" | "muted" | "warning" }) {
  const color =
    tone === "success" ? "text-[#52D6A4]" : tone === "warning" ? "text-[#FFC86B]" : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border/40 bg-card/40 px-2 py-1.5">
      <div className={`text-base font-semibold ${color}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

void CheckCircle2;
void NetIcon;
