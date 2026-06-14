import { AlertTriangle, Network, Plus } from "lucide-react";
import { DetailsDrawer } from "@/components/common/DetailsDrawer";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge, statusTone } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { can, useRole } from "@/lib/permissions";
import type { IpamAddress, IpamSubnet } from "@/lib/ipam/types";

export function SubnetDetailsDrawer({
  subnet,
  entries,
  onOpenChange,
  onReserveNext,
}: {
  subnet: IpamSubnet | null;
  entries: IpamAddress[];
  onOpenChange: (open: boolean) => void;
  onReserveNext: (subnetId: string) => Promise<unknown>;
}) {
  const role = useRole();
  const writable = can("ipam.manage", role);
  if (!subnet) return null;

  const allocated = entries.filter((entry) => entry.allocationState === "allocated").length;
  const free = entries.filter((entry) => entry.allocationState === "free").length;
  const reserved = entries.filter((entry) => entry.allocationState === "reserved").length;
  const conflicts = entries.filter((entry) => entry.conflictReason);
  const total = entries.length;
  const utilization = total ? Math.round((allocated / total) * 100) : 0;

  return <DetailsDrawer
    open
    onOpenChange={onOpenChange}
    title={subnet.cidr}
    description={`${subnet.networkName} · ${subnet.vlan || "No VLAN"} · Gateway ${subnet.gateway || "—"}`}
    footer={writable && <Button size="sm" variant="outline" onClick={() => void onReserveNext(subnet.id)}>
      <Plus className="mr-1.5 h-3.5 w-3.5" /> Reserve next free
    </Button>}
  >
    <div className="mb-4 rounded-2xl border border-border/40 bg-background/40 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Utilization</div>
        <div className="text-sm font-semibold">{utilization}%</div>
      </div>
      <Progress value={utilization} className="mt-2 h-1.5" />
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="Allocated" value={allocated} />
        <Stat label="Free" value={free} />
        <Stat label="Reserved" value={reserved} />
      </div>
    </div>
    {conflicts.length > 0 && <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4" /> {conflicts.length} integrity conflict{conflicts.length === 1 ? "" : "s"} detected
    </div>}
    {entries.length === 0
      ? <EmptyState icon={Network} title="No addresses" description="This subnet has no active address records." />
      : <ul className="divide-y divide-border/30 rounded-xl border border-border/40">
        {entries.map((entry) => <li key={entry.id} className="flex items-center justify-between px-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="font-mono">{entry.ipAddress}</div>
            <div className="truncate text-xs text-muted-foreground">{entry.hostname || entry.reservationName || "—"}</div>
          </div>
          <StatusBadge tone={statusTone(entry.allocationState)} label={entry.allocationState} />
        </li>)}
      </ul>}
  </DetailsDrawer>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-border/40 bg-card/40 px-2 py-1.5">
    <div className="text-base font-semibold">{value}</div>
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
  </div>;
}
