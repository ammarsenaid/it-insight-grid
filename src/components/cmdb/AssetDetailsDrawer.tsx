import { useQuery } from "@tanstack/react-query";
import { Archive, Building2, Calendar, Cpu, GitBranch, HardDrive, Trash2, Wrench } from "lucide-react";
import { DetailsDrawer } from "@/components/common/DetailsDrawer";
import { ActivityTimeline } from "@/components/common/ActivityTimeline";
import { formatDate, formatDateTime } from "@/components/common/format";
import { StatusBadge, statusTone } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { can, useRole } from "@/lib/permissions";
import { cmdbLifecycleQuery } from "@/lib/cmdb/queries";
import type { CmdbAsset } from "@/lib/cmdb/types";
import { toast } from "sonner";

export function AssetDetailsDrawer({
  asset,
  onOpenChange,
  onEdit,
  onStatusChange,
  onDelete,
}: {
  asset: CmdbAsset | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (asset: CmdbAsset) => void;
  onStatusChange: (id: string, status: CmdbAsset["status"]) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}) {
  const role = useRole();
  const writable = can("cmdb.manage", role);
  const lifecycle = useQuery({
    ...cmdbLifecycleQuery(asset?.id ?? ""),
    enabled: Boolean(asset),
  });

  if (!asset) return null;

  const changeStatus = async (status: CmdbAsset["status"]) => {
    try {
      await onStatusChange(asset.id, status);
      toast.success(`Marked as ${status}`);
    } catch {
      toast.error("The CMDB status change failed.");
    }
  };

  const remove = async () => {
    try {
      await onDelete(asset.id);
      onOpenChange(false);
    } catch {
      toast.error("The CMDB delete operation failed.");
    }
  };

  const events = (lifecycle.data ?? []).map((event) => ({
    id: event.id,
    title: eventTitle(event.eventType),
    description: event.eventType === "status_changed"
      ? `${event.fromStatus ?? "unknown"} to ${event.toStatus ?? "unknown"}`
      : event.eventType === "ownership_changed"
        ? `${event.fromOwner || "Unassigned"} to ${event.toOwner || "Unassigned"}`
        : undefined,
    timestamp: event.createdAt,
    tone: event.eventType === "deleted" ? "danger" as const
      : event.eventType === "restored" ? "success" as const
        : event.eventType === "status_changed" ? "warning" as const : "info" as const,
  }));

  return <DetailsDrawer
    open
    onOpenChange={onOpenChange}
    title={asset.hostname}
    description={`${asset.displayName || asset.assetType} · ${asset.environment}`}
    actions={writable && <Button size="sm" variant="ghost" onClick={() => onEdit(asset)}>Edit</Button>}
    footer={writable && <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => void changeStatus("maintenance")}><Wrench className="mr-1.5 h-3.5 w-3.5" /> Maintenance</Button>
      <Button size="sm" variant="outline" onClick={() => void changeStatus("retired")}><Archive className="mr-1.5 h-3.5 w-3.5" /> Retire</Button>
      <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => void remove()}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete</Button>
    </div>}
  >
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <StatusBadge tone={statusTone(asset.status)} label={asset.status} />
      <StatusBadge tone="info" label={asset.assetType} />
      <StatusBadge tone="muted" label={asset.environment} />
      {asset.ipAddress && <span className="font-mono text-xs text-muted-foreground">{asset.ipAddress}</span>}
    </div>
    <Tabs defaultValue="overview">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
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
        {asset.notes && <div className="mt-4 rounded-xl border border-border/40 bg-background/40 p-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Notes</div>
          <div className="whitespace-pre-wrap text-sm text-foreground/90">{asset.notes}</div>
        </div>}
      </TabsContent>
      <TabsContent value="lifecycle">
        {lifecycle.isError
          ? <div className="text-sm text-destructive">Lifecycle history could not be loaded.</div>
          : <ActivityTimeline entries={events.length ? events : fallbackLifecycle(asset)} emptyLabel="No lifecycle events recorded." />}
      </TabsContent>
    </Tabs>
  </DetailsDrawer>;
}

function eventTitle(event: string): string {
  return ({
    created: "Asset created", updated: "Asset updated", status_changed: "Status changed",
    ownership_changed: "Ownership changed", deleted: "Asset deleted", restored: "Asset restored",
  } as Record<string, string>)[event] ?? "Asset changed";
}

function fallbackLifecycle(asset: CmdbAsset): Parameters<typeof ActivityTimeline>[0]["entries"] {
  return [{ id: "created", title: "Asset created", description: asset.owner ? `Owner: ${asset.owner}` : undefined, timestamp: asset.createdAt, tone: "info", icon: HardDrive }];
}

function Meta({ icon: Icon, label, value, mono }: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return <div className="rounded-xl border border-border/40 bg-background/40 px-3 py-2">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{Icon && <Icon className="h-3 w-3" />} {label}</div>
    <div className={mono ? "mt-0.5 font-mono text-xs" : "mt-0.5 text-sm"}>{value || "—"}</div>
  </div>;
}
