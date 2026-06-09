import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, X, ExternalLink, Server, Network, Ticket, CheckSquare, StickyNote, BookOpen, ListChecks, Users, UsersRound, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { EntityKind, RelationRef } from "@/lib/relations/service";

const ICONS: Record<EntityKind, typeof Server> = {
  ticket: Ticket,
  task: CheckSquare,
  asset: Server,
  ipam: Network,
  note: StickyNote,
  knowledge: BookOpen,
  protocol_run: ListChecks,
  protocol_template: ListChecks,
  user: Users,
  team: UsersRound,
};

const LABEL: Record<EntityKind, string> = {
  ticket: "Ticket",
  task: "Task",
  asset: "Asset",
  ipam: "IP Address",
  note: "Note",
  knowledge: "Knowledge",
  protocol_run: "Protocol Run",
  protocol_template: "Protocol Template",
  user: "User",
  team: "Team",
};

export interface RelationshipPanelProps {
  title?: string;
  relations: RelationRef[];
  /** Candidate items shown in the Add Link picker. */
  pickerOptions?: RelationRef[];
  onAdd?: (ref: RelationRef) => void;
  onRemove?: (ref: RelationRef) => void;
  canEdit?: boolean;
  maxPreview?: number;
  emptyHint?: string;
  className?: string;
}

export function RelationshipPanel({
  title = "Related records",
  relations,
  pickerOptions = [],
  onAdd,
  onRemove,
  canEdit = false,
  maxPreview = 3,
  emptyHint = "No linked records yet.",
  className,
}: RelationshipPanelProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  const visible = expanded ? relations : relations.slice(0, maxPreview);
  const overflow = Math.max(0, relations.length - maxPreview);

  const filteredOptions = pickerOptions.filter((o) => {
    if (relations.some((r) => r.kind === o.kind && r.id === o.id)) return false;
    if (!pickerQuery) return true;
    const q = pickerQuery.toLowerCase();
    return o.title.toLowerCase().includes(q) || (o.subtitle ?? "").toLowerCase().includes(q);
  });

  return (
    <div className={cn("rounded-xl border border-border/40 bg-card/40 p-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="h-3.5 w-3.5 text-primary" />
          {title}
          <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">{relations.length}</Badge>
        </div>
        {canEdit && onAdd && (
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setPickerOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add link
          </Button>
        )}
      </div>

      {relations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/40 px-3 py-4 text-center text-xs text-muted-foreground">
          {emptyHint}
        </div>
      ) : (
        <ul className="space-y-1">
          {visible.map((r) => {
            const Icon = ICONS[r.kind];
            return (
              <li key={`${r.kind}:${r.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{r.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {LABEL[r.kind]}{r.subtitle ? ` · ${r.subtitle}` : ""}{r.status ? ` · ${r.status}` : ""}
                  </div>
                </div>
                {r.route && (
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => navigate({ to: r.route! })} aria-label="Open">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                )}
                {canEdit && onRemove && (
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onRemove(r)} aria-label="Remove">
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!expanded && overflow > 0 && (
        <Button variant="ghost" size="sm" className="mt-1 h-7 w-full text-xs" onClick={() => setExpanded(true)}>
          View all ({relations.length})
        </Button>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add link</DialogTitle></DialogHeader>
          <Input placeholder="Search records…" value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} />
          <ScrollArea className="h-72">
            {filteredOptions.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No matching records.</div>
            ) : (
              <ul className="space-y-1">
                {filteredOptions.map((o) => {
                  const Icon = ICONS[o.kind];
                  return (
                    <li key={`${o.kind}:${o.id}`}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.04]"
                        onClick={() => { onAdd?.(o); setPickerOpen(false); setPickerQuery(""); }}
                      >
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{o.title}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{LABEL[o.kind]}{o.subtitle ? ` · ${o.subtitle}` : ""}</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
