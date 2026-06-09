import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createCategory, updateCategory } from "@/lib/knowledge/mutations";
import { isValidSlug, slugify } from "@/lib/knowledge/slug";
import type { KbCategory } from "@/lib/knowledge/backend-types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teamId: string;
  spaceId: string;
  initial?: KbCategory | null;
  defaultSortOrder?: number;
  onSaved?: (id: string) => void;
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  teamId,
  spaceId,
  initial,
  defaultSortOrder,
  onSaved,
}: Props) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [sortOrder, setSortOrder] = useState<number>(initial?.sort_order ?? defaultSortOrder ?? 0);
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setSlug(initial?.slug ?? "");
      setDescription(initial?.description ?? "");
      setSortOrder(initial?.sort_order ?? defaultSortOrder ?? 0);
      setSlugTouched(!!initial);
      setBusy(false);
    }
  }, [open, initial, defaultSortOrder]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name, 100));
  }, [name, slugTouched]);

  const valid =
    name.trim().length >= 2 && name.trim().length <= 120 && isValidSlug(slug, 100) && sortOrder >= 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    const res = editing
      ? await updateCategory({ id: initial!.id, name, slug, description, sort_order: sortOrder })
      : await createCategory({ teamId, spaceId, name, slug, description, sortOrder });
    setBusy(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? "Could not save category.");
      return;
    }
    toast.success(editing ? "Category updated." : "Category created.");
    onSaved?.(res.data.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label className="text-xs">Slug</Label>
            <Input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              maxLength={100}
              spellCheck={false}
            />
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Textarea
              rows={3}
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Sort order</Label>
            <Input
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
