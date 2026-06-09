import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { assignTag, createTag, deleteTag, unassignTag, updateTag } from "@/lib/knowledge/mutations";
import { slugify } from "@/lib/knowledge/slug";
import type { KbTag } from "@/lib/knowledge/backend-types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teamId: string;
  /** When set, lets the user toggle tags for a specific article. */
  articleId?: string;
  allTags: KbTag[];
  /** ids of tags currently assigned to articleId */
  assignedTagIds?: Set<string>;
  /** Whether the current user can update tag <-> article assignments. */
  canUpdate: boolean;
  /** Whether the current user can delete tags. */
  canDelete: boolean;
  onChange?: () => void;
}

export function TagsEditorDialog({
  open,
  onOpenChange,
  teamId,
  articleId,
  allTags,
  assignedTagIds,
  canUpdate,
  canDelete,
  onChange,
}: Props) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (open) {
      setNewName("");
      setEditingId(null);
      setEditName("");
      setBusy(false);
    }
  }, [open]);

  const sorted = useMemo(() => [...allTags].sort((a, b) => a.name.localeCompare(b.name)), [allTags]);

  async function handleCreate() {
    const name = newName.trim();
    if (name.length < 2) return;
    setBusy(true);
    const res = await createTag({ teamId, name, slug: slugify(name, 80) });
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    setNewName("");
    toast.success("Tag created.");
    onChange?.();
  }

  async function handleToggle(tag: KbTag) {
    if (!articleId || !canUpdate) return;
    const isAssigned = assignedTagIds?.has(tag.id);
    setBusy(true);
    const res = isAssigned
      ? await unassignTag({ articleId, tagId: tag.id })
      : await assignTag({ teamId, articleId, tagId: tag.id });
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    onChange?.();
  }

  async function handleRename(tag: KbTag) {
    const name = editName.trim();
    if (name.length < 2) return;
    setBusy(true);
    const res = await updateTag({ id: tag.id, name, slug: slugify(name, 80) });
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    setEditingId(null);
    toast.success("Tag renamed.");
    onChange?.();
  }

  async function handleDelete(tag: KbTag) {
    setBusy(true);
    const res = await deleteTag(tag.id);
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Tag deleted.");
    onChange?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{articleId ? "Article tags" : "Team tags"}</DialogTitle>
        </DialogHeader>

        {canUpdate && (
          <div className="flex gap-2">
            <Input
              placeholder="New tag name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
              maxLength={80}
            />
            <Button onClick={() => void handleCreate()} disabled={busy || newName.trim().length < 2}>
              <Plus className="mr-1 h-3 w-3" /> Add
            </Button>
          </div>
        )}

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {sorted.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tags in this team yet.</p>
          ) : (
            sorted.map((tag) => {
              const assigned = assignedTagIds?.has(tag.id) ?? false;
              const isEditing = editingId === tag.id;
              return (
                <div
                  key={tag.id}
                  className="flex items-center gap-2 rounded-md border border-border/30 p-1.5 text-sm"
                >
                  {isEditing ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7"
                        maxLength={80}
                      />
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void handleRename(tag)}>
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      {articleId ? (
                        <button
                          type="button"
                          onClick={() => void handleToggle(tag)}
                          disabled={!canUpdate || busy}
                          className="flex flex-1 items-center gap-2 text-left disabled:opacity-50"
                        >
                          <Badge variant={assigned ? "default" : "outline"} className="h-5">
                            {assigned ? "✓ " : ""}#{tag.name}
                          </Badge>
                        </button>
                      ) : (
                        <Badge variant="outline" className="h-5">#{tag.name}</Badge>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        {canUpdate && (
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2 text-xs"
                            onClick={() => { setEditingId(tag.id); setEditName(tag.name); }}
                          >Rename</Button>
                        )}
                        {canDelete && (
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2 text-destructive"
                            onClick={() => void handleDelete(tag)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
