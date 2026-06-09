import { useMemo, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";
import { useData } from "@/lib/data/store";
import type { ID } from "@/lib/data/types";

export type RelationKind = "ticket" | "asset" | "ipam" | "task" | "note" | "user";

export interface RelationSelection {
  ticketIds: ID[];
  assetIds: ID[];
  ipamIds: ID[];
  taskIds: ID[];
  noteIds: ID[];
  userIds: ID[];
}

const KIND_TO_KEY: Record<RelationKind, keyof RelationSelection> = {
  ticket: "ticketIds",
  asset: "assetIds",
  ipam: "ipamIds",
  task: "taskIds",
  note: "noteIds",
  user: "userIds",
};


export function RelationPicker({
  open,
  onOpenChange,
  value,
  onSave,
  title = "Link records",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: RelationSelection;
  onSave: (next: RelationSelection) => void;
  title?: string;
}) {
  const data = useData();
  const [draft, setDraft] = useState<RelationSelection>(value);
  const [q, setQ] = useState("");

  // sync draft when reopened
  useMemo(() => setDraft(value), [value, open]);

  const toggle = (kind: RelationKind, id: string) => {
    setDraft((d) => {
      const key = KIND_TO_KEY[kind];
      const list = d[key];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      return { ...d, [key]: next };
    });
  };

  const filterFn = <T extends { id: string }>(items: T[], fields: (keyof T)[]) => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) => fields.some((f) => String(it[f] ?? "").toLowerCase().includes(term)));
  };


  const totalSelected =
    draft.ticketIds.length +
    draft.assetIds.length +
    draft.ipamIds.length +
    draft.taskIds.length +
    draft.noteIds.length +
    draft.userIds.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Link this document to operational records. Selections persist locally.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter records…"
            className="h-9 pl-9"
          />
        </div>

        <Tabs defaultValue="ticket" className="mt-2">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="ticket">
              Tickets {draft.ticketIds.length > 0 && <Pill n={draft.ticketIds.length} />}
            </TabsTrigger>
            <TabsTrigger value="asset">
              Assets {draft.assetIds.length > 0 && <Pill n={draft.assetIds.length} />}
            </TabsTrigger>
            <TabsTrigger value="ipam">
              IPs {draft.ipamIds.length > 0 && <Pill n={draft.ipamIds.length} />}
            </TabsTrigger>
            <TabsTrigger value="task">
              Tasks {draft.taskIds.length > 0 && <Pill n={draft.taskIds.length} />}
            </TabsTrigger>
            <TabsTrigger value="note">
              Notes {draft.noteIds.length > 0 && <Pill n={draft.noteIds.length} />}
            </TabsTrigger>
            <TabsTrigger value="user">
              Users {draft.userIds.length > 0 && <Pill n={draft.userIds.length} />}
            </TabsTrigger>
          </TabsList>

          <PickerList
            value="ticket"
            items={filterFn(data.tickets, ["number", "subject"]).map((t) => ({
              id: t.id,
              primary: t.number,
              secondary: t.subject,
            }))}
            selected={draft.ticketIds}
            onToggle={(id) => toggle("ticket", id)}
          />
          <PickerList
            value="asset"
            items={filterFn(data.assets, ["hostname", "displayName"]).map((a) => ({
              id: a.id,
              primary: a.hostname,
              secondary: a.displayName,
            }))}
            selected={draft.assetIds}
            onToggle={(id) => toggle("asset", id)}
          />
          <PickerList
            value="ipam"
            items={filterFn(data.ipam, ["ipAddress", "hostname"]).map((ip) => ({
              id: ip.id,
              primary: ip.ipAddress,
              secondary: ip.hostname || ip.subnet,
            }))}
            selected={draft.ipamIds}
            onToggle={(id) => toggle("ipam", id)}
          />
          <PickerList
            value="task"
            items={filterFn(data.tasks, ["title", "category"]).map((t) => ({
              id: t.id,
              primary: t.title,
              secondary: t.category,
            }))}
            selected={draft.taskIds}
            onToggle={(id) => toggle("task", id)}
          />
          <PickerList
            value="note"
            items={filterFn(data.notes, ["title", "category"]).map((n) => ({
              id: n.id,
              primary: n.title,
              secondary: n.category,
            }))}
            selected={draft.noteIds}
            onToggle={(id) => toggle("note", id)}
          />
          <PickerList
            value="user"
            items={filterFn(MOCK_USERS, ["label"]).map((u) => ({ id: u.id, primary: u.label }))}
            selected={draft.userIds}
            onToggle={(id) => toggle("user", id)}
            emptyHint="User directory ships in Batch 7 — these are mock entries."
          />
        </Tabs>

        <DialogFooter className="mt-2">
          <div className="mr-auto text-xs text-muted-foreground">
            {totalSelected} record{totalSelected === 1 ? "" : "s"} selected
          </div>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSave(draft); onOpenChange(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Pill({ n }: { n: number }) {
  return (
    <Badge variant="outline" className="ml-1.5 h-4 border-primary/40 bg-primary/15 px-1 text-[9px] font-bold text-primary">
      {n}
    </Badge>
  );
}

function PickerList({
  value,
  items,
  selected,
  onToggle,
  emptyHint,
}: {
  value: string;
  items: { id: string; primary: string; secondary?: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  emptyHint?: ReactNode;
}) {
  return (
    <TabsContent value={value} className="mt-3">
      <div className="max-h-[300px] overflow-y-auto rounded-xl border border-border/40 bg-background/40">
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            No matches. {emptyHint}
          </div>
        ) : (
          <ul className="divide-y divide-border/30">
            {items.map((it) => {
              const checked = selected.includes(it.id);
              return (
                <li key={it.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-white/[0.03]">
                    <Checkbox checked={checked} onCheckedChange={() => onToggle(it.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{it.primary}</div>
                      {it.secondary && (
                        <div className="truncate text-xs text-muted-foreground">{it.secondary}</div>
                      )}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </TabsContent>
  );
}
