import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createSpace, updateSpace } from "@/lib/knowledge/mutations";
import { isValidSlug, slugify } from "@/lib/knowledge/slug";
import type { KbSpace } from "@/lib/knowledge/backend-types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teamId: string;
  /** If provided we're editing; otherwise creating. */
  initial?: KbSpace | null;
  onSaved?: (id: string) => void;
}

export function SpaceFormDialog({ open, onOpenChange, teamId, initial, onSaved }: Props) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setSlug(initial?.slug ?? "");
      setDescription(initial?.description ?? "");
      setSlugTouched(!!initial);
      setBusy(false);
    }
  }, [open, initial]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name, 100));
  }, [name, slugTouched]);

  const valid =
    name.trim().length >= 2 && name.trim().length <= 120 && isValidSlug(slug, 100);

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    const res = editing
      ? await updateSpace({ id: initial!.id, name, slug, description })
      : await createSpace({ teamId, name, slug, description });
    setBusy(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? "Could not save space.");
      return;
    }
    toast.success(editing ? "Space updated." : "Space created.");
    onSaved?.(res.data.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit space" : "New space"}</DialogTitle>
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
            <p className="mt-1 text-[11px] text-muted-foreground">
              lowercase letters, digits and hyphens. Must be unique within the team.
            </p>
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Textarea
              rows={3}
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create space"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
