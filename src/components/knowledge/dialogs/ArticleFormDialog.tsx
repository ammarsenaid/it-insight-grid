import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createArticle, updateArticle } from "@/lib/knowledge/mutations";
import { isValidSlug, slugify } from "@/lib/knowledge/slug";
import type { KbArticle, KbCategory, KbSpace } from "@/lib/knowledge/backend-types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teamId: string;
  spaces: KbSpace[];
  categories: KbCategory[];
  /** For "edit metadata"; omit to create. */
  initial?: KbArticle | null;
  defaultSpaceId?: string;
  defaultCategoryId?: string | null;
  onSaved?: (id: string) => void;
}

export function ArticleFormDialog({
  open,
  onOpenChange,
  teamId,
  spaces,
  categories,
  initial,
  defaultSpaceId,
  defaultCategoryId,
  onSaved,
}: Props) {
  const editing = !!initial;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [spaceId, setSpaceId] = useState(initial?.space_id ?? defaultSpaceId ?? spaces[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState<string | "">(
    initial?.category_id ?? defaultCategoryId ?? "",
  );
  const [visibility, setVisibility] = useState(initial?.visibility ?? "team");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? "");
      setSlug(initial?.slug ?? "");
      setExcerpt(initial?.excerpt ?? "");
      setSpaceId(initial?.space_id ?? defaultSpaceId ?? spaces[0]?.id ?? "");
      setCategoryId(initial?.category_id ?? defaultCategoryId ?? "");
      setVisibility(initial?.visibility ?? "team");
      setSlugTouched(!!initial);
      setBusy(false);
    }
  }, [open, initial, defaultSpaceId, defaultCategoryId, spaces]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(title, 160));
  }, [title, slugTouched]);

  const categoriesForSpace = categories.filter((c) => c.space_id === spaceId && !c.is_archived);

  const valid =
    title.trim().length >= 3 && title.trim().length <= 240 && isValidSlug(slug, 160) && !!spaceId;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    const catId = categoryId || null;
    const res = editing
      ? await updateArticle({
          id: initial!.id,
          title,
          slug,
          excerpt,
          categoryId: catId,
          visibility,
        })
      : await createArticle({
          teamId,
          spaceId,
          categoryId: catId,
          title,
          slug,
          excerpt,
          visibility,
        });
    setBusy(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? "Could not save article.");
      return;
    }
    toast.success(editing ? "Article metadata saved." : "Draft article created.");
    onSaved?.(res.data.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit article metadata" : "New article"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={240} />
          </div>
          <div>
            <Label className="text-xs">Slug</Label>
            <Input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              maxLength={160}
              spellCheck={false}
            />
          </div>
          <div>
            <Label className="text-xs">Excerpt (optional)</Label>
            <Textarea rows={2} value={excerpt ?? ""} onChange={(e) => setExcerpt(e.target.value)} />
          </div>
          {!editing && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Space</Label>
                <Select value={spaceId} onValueChange={(v) => { setSpaceId(v); setCategoryId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select space" /></SelectTrigger>
                  <SelectContent>
                    {spaces.filter((s) => !s.is_archived).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Category (optional)</Label>
                <Select
                  value={categoryId || "__none__"}
                  onValueChange={(v) => setCategoryId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Uncategorized</SelectItem>
                    {categoriesForSpace.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {editing && (
            <div>
              <Label className="text-xs">Category</Label>
              <Select
                value={categoryId || "__none__"}
                onValueChange={(v) => setCategoryId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Uncategorized</SelectItem>
                  {categoriesForSpace.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Visibility</Label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="team">Team — published readable by all team readers</SelectItem>
                <SelectItem value="editors">Editors — visible only to editors and admins</SelectItem>
                <SelectItem value="private">Private — only the author and platform admins</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
