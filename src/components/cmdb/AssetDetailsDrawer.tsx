import { useMemo, useState } from "react";
import {
  Activity as ActIcon,
  AlertCircle,
  Archive,
  Building2,
  Calendar,
  Cpu,
  FileText,
  GitBranch,
  HardDrive,
  Link2,
  Network as NetIcon,
  Plus,
  Ticket as TicketIcon,
  Trash2,
  Wrench,
} from "lucide-react";
import { DetailsDrawer } from "@/components/common/DetailsDrawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge, statusTone } from "@/components/common/StatusBadge";
import { ActivityTimeline } from "@/components/common/ActivityTimeline";
import { EmptyState } from "@/components/common/EmptyState";
import { formatDate, formatDateTime } from "@/components/common/format";
import { logActivity, setState, trashItem, uid, useData } from "@/lib/data/store";
import { createTicket } from "@/lib/data/tickets";
import { can, useRole } from "@/lib/permissions";
import type { CMDBAsset, ID, Task } from "@/lib/data/types";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AssetDetailsDrawer({
  assetId,
  onOpenChange,
  onEdit,
}: {
  assetId: string | null;
  onOpenChange: (o: boolean) => void;
  onEdit: (a: CMDBAsset) => void;
}) {
  const data = useData();
  const role = useRole();
  const asset = data.assets.find((a) => a.id === assetId) ?? null;
  const [tab, setTab] = useState("overview");

  const relatedIPs = useMemo(
    () => (asset ? data.ipam.filter((i) => i.linkedAssetId === asset.id) : []),
    [data.ipam, asset],
  );
  const relatedTickets = useMemo(
    () => (asset ? data.tickets.filter((t) => t.linkedAssetId === asset.id) : []),
    [data.tickets, asset],
  );
  const relatedTasks = useMemo(
    () => (asset ? data.tasks.filter((t) => t.linkedAssetId === asset.id) : []),
    [data.tasks, asset],
  );
  const relatedDocs = useMemo(() => {
    if (!asset) return [];
    return data.documents.filter(
      (d) => d.relations?.assetIds?.includes(asset.id) || new RegExp(asset.hostname, "i").test(d.name),
    );
  }, [data.documents, asset]);

  const dependencies = useMemo(() => {
    if (!asset) return [];
    const ids = asset.dependencyIds ?? [];
    return data.assets.filter((a) => ids.includes(a.id));
  }, [data.assets, asset]);

  const dependents = useMemo(() => {
    if (!asset) return [];
    return data.assets.filter((a) => a.dependencyIds?.includes(asset.id));
  }, [data.assets, asset]);

  const activity = useMemo(() => {
    if (!asset) return [];
    return data.activity
      .filter((a) => a.entityId === asset.id || a.message.includes(asset.hostname))
      .slice(0, 25)
      .map((a) => ({
        id: a.id,
        title: a.message,
        timestamp: a.createdAt,
        tone: a.type.includes("delete") ? "danger" as const : a.type.includes("status") ? "warning" as const : "info" as const,
      }));
  }, [data.activity, asset]);

  if (!asset) return null;

  const setStatus = (status: CMDBAsset["status"]) => {
    setState((s) => ({
      ...s,
      assets: s.assets.map((a) =>
        a.id === asset.id ? { ...a, status, updatedAt: new Date().toISOString() } : a,
      ),
    }));
    logActivity("asset.status", `Set ${asset.hostname} to ${status}`, "asset", asset.id);
    toast.success(`Marked as ${status}`);
  };

  const remove = () => {
    trashItem("asset", asset.hostname, "CMDB", asset, 1024);
    setState((s) => ({ ...s, assets: s.assets.filter((a) => a.id !== asset.id) }));
    logActivity("asset.delete", `Deleted CMDB asset '${asset.hostname}'`);
    toast.success("Asset moved to recycle bin");
    onOpenChange(false);
  };

  const createLinkedTicket = () => {
    const t = createTicket({
      requester: "system.user",
      subject: `${asset.hostname} — operational follow-up`,
      description: `Auto-generated from CMDB asset ${asset.hostname} (${asset.assetType}).`,
      type: "incident",
      category: "Infrastructure",
      priority: "normal",
      linkedAssetId: asset.id,
    });
    toast.success(`Created ${t.number}`);
    setTab("tickets");
  };

  const createLinkedTask = () => {
    const newTask: Task = {
      id: uid("tsk"),
      title: `Follow up on ${asset.hostname}`,
      category: "CMDB",
      priority: "normal",
      status: "open",
      assignedTo: asset.owner || "unassigned",
      linkedAssetId: asset.id,
      notes: `Linked from CMDB asset ${asset.hostname}.`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setState((s) => ({ ...s, tasks: [newTask, ...s.tasks] }));
    logActivity("task.create", `Created task '${newTask.title}'`, "task", newTask.id);
    toast.success("Task created");
    setTab("tasks");
  };

  const writable = can("cmdb.write", role);

  return (
    <DetailsDrawer
      open={!!assetId}
      onOpenChange={onOpenChange}
      title={asset.hostname}
      description={`${asset.displayName || asset.assetType} · ${asset.environment}`}
      actions={
        writable && (
          <>
            <Button size="sm" variant="ghost" onClick={() => onEdit(asset)}>Edit</Button>
          </>
        )
      }
      footer={
        writable && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={createLinkedTicket}>
              <TicketIcon className="mr-1.5 h-3.5 w-3.5" /> Create ticket
            </Button>
            <Button size="sm" variant="outline" onClick={createLinkedTask}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Create task
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStatus("maintenance")}>
              <Wrench className="mr-1.5 h-3.5 w-3.5" /> Maintenance
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStatus("retired")}>
              <Archive className="mr-1.5 h-3.5 w-3.5" /> Retire
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={remove}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={statusTone(asset.status)} label={asset.status} />
        <StatusBadge tone="info" label={asset.assetType} />
        <StatusBadge tone="muted" label={asset.environment} />
        {asset.ipAddress && (
          <span className="font-mono text-xs text-muted-foreground">{asset.ipAddress}</span>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ips">
            IPs {relatedIPs.length > 0 && <Pill n={relatedIPs.length} />}
          </TabsTrigger>
          <TabsTrigger value="documents">
            Docs {relatedDocs.length > 0 && <Pill n={relatedDocs.length} />}
          </TabsTrigger>
          <TabsTrigger value="tickets">
            Tickets {relatedTickets.length > 0 && <Pill n={relatedTickets.length} />}
          </TabsTrigger>
        </TabsList>
        <TabsList className="mt-1 grid w-full grid-cols-4">
          <TabsTrigger value="tasks">
            Tasks {relatedTasks.length > 0 && <Pill n={relatedTasks.length} />}
          </TabsTrigger>
          <TabsTrigger value="deps">
            Deps {(dependencies.length + dependents.length) > 0 && <Pill n={dependencies.length + dependents.length} />}
          </TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Meta icon={Cpu} label="OS" value={asset.os} />
            <Meta icon={GitBranch} label="Role" value={asset.role} />
            <Meta icon={Building2} label="Location" value={asset.location} />
            <Meta label="Owner" value={asset.owner} />
            <Meta label="Vendor" value={asset.vendor} />
            <Meta label="Model" value={asset.model} />
            <Meta label="Serial" value={asset.serialNumber} mono />
            <Meta label="Asset tag" value={asset.assetTag} mono />
            <Meta label="MAC" value={asset.macAddress} mono />
            <Meta icon={Calendar} label="Warranty" value={formatDate(asset.warrantyExpiration)} />
            <Meta label="Created" value={formatDateTime(asset.createdAt)} />
            <Meta label="Updated" value={formatDateTime(asset.updatedAt)} />
          </div>
          {asset.notes && (
            <div className="mt-4 rounded-xl border border-border/40 bg-background/40 p-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Notes</div>
              <div className="text-sm whitespace-pre-wrap text-foreground/90">{asset.notes}</div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="ips">
          {relatedIPs.length === 0 ? (
            <EmptyState icon={NetIcon} title="No related IP records" description="Assign IPs from IPAM to link them here." />
          ) : (
            <ul className="divide-y divide-border/30 rounded-xl border border-border/40">
              {relatedIPs.map((ip) => (
                <li key={ip.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <div className="font-mono">{ip.ipAddress}</div>
                    <div className="text-xs text-muted-foreground">{ip.hostname || ip.subnet}</div>
                  </div>
                  <StatusBadge tone={statusTone(ip.status)} label={ip.status} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="documents">
          {relatedDocs.length === 0 ? (
            <EmptyState icon={FileText} title="No linked documents" description="Use the Documents module to link runbooks and references." />
          ) : (
            <ul className="divide-y divide-border/30 rounded-xl border border-border/40">
              {relatedDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{d.title || d.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{d.name}</div>
                  </div>
                  <StatusBadge tone={statusTone(d.status)} label={d.status} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="tickets">
          {relatedTickets.length === 0 ? (
            <EmptyState icon={TicketIcon} title="No tickets for this asset" description="Open a new ticket from the footer actions." />
          ) : (
            <ul className="divide-y divide-border/30 rounded-xl border border-border/40">
              {relatedTickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.number} · {t.subject}</div>
                    <div className="text-xs text-muted-foreground">{t.type} · {t.priority}</div>
                  </div>
                  <StatusBadge tone={statusTone(t.status)} label={t.status} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="tasks">
          {relatedTasks.length === 0 ? (
            <EmptyState icon={ActIcon} title="No tasks" description="Use Create task from the footer to add follow-up work." />
          ) : (
            <ul className="divide-y divide-border/30 rounded-xl border border-border/40">
              {relatedTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{t.category} · {t.assignedTo}</div>
                  </div>
                  <StatusBadge tone={statusTone(t.status)} label={t.status} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="deps">
          <DependenciesEditor asset={asset} writable={writable} dependencies={dependencies} dependents={dependents} />
        </TabsContent>

        <TabsContent value="lifecycle">
          <LifecycleTimeline asset={asset} />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityTimeline entries={activity} emptyLabel="No activity recorded for this asset yet." />
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

function Meta({ icon: Icon, label, value, mono }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </div>
      <div className={mono ? "mt-0.5 font-mono text-xs" : "mt-0.5 text-sm"}>{value || "—"}</div>
    </div>
  );
}

function LifecycleTimeline({ asset }: { asset: CMDBAsset }) {
  const entries = [
    {
      id: "created",
      title: "Asset created",
      description: asset.owner ? `Owner: ${asset.owner}` : undefined,
      timestamp: asset.createdAt,
      tone: "info" as const,
      icon: HardDrive,
    },
    {
      id: "updated",
      title: "Last updated",
      timestamp: asset.updatedAt,
      tone: "default" as const,
    },
    asset.warrantyExpiration
      ? {
          id: "warranty",
          title: `Warranty ${new Date(asset.warrantyExpiration) > new Date() ? "until" : "expired"} ${formatDate(asset.warrantyExpiration)}`,
          timestamp: asset.warrantyExpiration,
          tone: new Date(asset.warrantyExpiration) > new Date() ? ("success" as const) : ("danger" as const),
          icon: Calendar,
        }
      : null,
    asset.status === "retired"
      ? { id: "retired", title: "Asset retired", timestamp: asset.updatedAt, tone: "danger" as const, icon: Archive }
      : null,
    asset.status === "maintenance"
      ? { id: "maint", title: "In maintenance", timestamp: asset.updatedAt, tone: "warning" as const, icon: Wrench }
      : null,
  ].filter(Boolean) as Parameters<typeof ActivityTimeline>[0]["entries"];
  return <ActivityTimeline entries={entries} />;
}

function DependenciesEditor({
  asset,
  writable,
  dependencies,
  dependents,
}: {
  asset: CMDBAsset;
  writable: boolean;
  dependencies: CMDBAsset[];
  dependents: CMDBAsset[];
}) {
  const data = useData();
  const candidates = data.assets.filter((a) => a.id !== asset.id && !(asset.dependencyIds ?? []).includes(a.id));
  const [pick, setPick] = useState<string>("");

  const addDep = () => {
    if (!pick) return;
    setState((s) => ({
      ...s,
      assets: s.assets.map((a) =>
        a.id === asset.id
          ? { ...a, dependencyIds: [...(a.dependencyIds ?? []), pick], updatedAt: new Date().toISOString() }
          : a,
      ),
    }));
    logActivity("asset.dependency", `Linked dependency to ${asset.hostname}`, "asset", asset.id);
    toast.success("Dependency added");
    setPick("");
  };

  const removeDep = (id: ID) => {
    setState((s) => ({
      ...s,
      assets: s.assets.map((a) =>
        a.id === asset.id
          ? { ...a, dependencyIds: (a.dependencyIds ?? []).filter((d) => d !== id), updatedAt: new Date().toISOString() }
          : a,
      ),
    }));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-muted-foreground">Depends on</Label>
        {dependencies.length === 0 ? (
          <div className="mt-1 rounded-xl border border-dashed border-border/40 px-3 py-4 text-center text-xs text-muted-foreground">
            No upstream dependencies recorded.
          </div>
        ) : (
          <ul className="mt-1 divide-y divide-border/30 rounded-xl border border-border/40">
            {dependencies.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-mono">{d.hostname}</span>
                <div className="flex items-center gap-2">
                  <StatusBadge tone="info" label={d.assetType} />
                  {writable && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeDep(d.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {writable && (
          <div className="mt-2 flex items-center gap-2">
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Add dependency…" /></SelectTrigger>
              <SelectContent>
                {candidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.hostname} — {c.assetType}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={addDep} disabled={!pick}><Link2 className="mr-1 h-3.5 w-3.5" /> Link</Button>
          </div>
        )}
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Dependents</Label>
        {dependents.length === 0 ? (
          <div className="mt-1 rounded-xl border border-dashed border-border/40 px-3 py-4 text-center text-xs text-muted-foreground">
            No assets depend on this one.
          </div>
        ) : (
          <ul className="mt-1 divide-y divide-border/30 rounded-xl border border-border/40">
            {dependents.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-mono">{d.hostname}</span>
                <StatusBadge tone="info" label={d.assetType} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// keep Input import used
void Input;
void AlertCircle;
