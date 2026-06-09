import { useEffect, useRef, useState } from "react";
import { Save, Send, Archive, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownEditor } from "@/components/common/MarkdownEditor";
import {
  archiveArticle,
  publishArticle,
  restoreArticleToDraft,
  updateArticle,
} from "@/lib/knowledge/mutations";
import type { KbArticle } from "@/lib/knowledge/backend-types";

interface Props {
  article: KbArticle;
  canUpdate: boolean;
  canDelete: boolean;
  onSaved: () => void;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};

/**
 * Inline Markdown editor for an existing article. Title/metadata changes
 * use the ArticleFormDialog; this view focuses on body content + status.
 */
export function ArticleContentEditor({ article, canUpdate, onSaved, onClose }: Props) {
  const [content, setContent] = useState(article.content_markdown ?? "");
  const [busy, setBusy] = useState(false);
  const initialRef = useRef(article.content_markdown ?? "");
  const dirtyRef = useRef(false);

  // Reset on article change
  useEffect(() => {
    initialRef.current = article.content_markdown ?? "";
    setContent(article.content_markdown ?? "");
    dirtyRef.current = false;
  }, [article.id, article.content_markdown]);

  const dirty = content !== initialRef.current;
  dirtyRef.current = dirty;

  // Beforeunload warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  async function save(newStatus?: KbArticle["status"]) {
    if (busy) return;
    setBusy(true);
    const res = await updateArticle({
      id: article.id,
      contentMarkdown: content,
      status: newStatus,
    });
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    initialRef.current = content;
    toast.success(newStatus === "published" ? "Article published." : "Draft saved.");
    onSaved();
  }

  async function doPublish() {
    if (dirty) { await save("published"); return; }
    setBusy(true);
    const res = await publishArticle(article.id);
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Article published.");
    onSaved();
  }

  async function doArchive() {
    setBusy(true);
    const res = await archiveArticle(article.id);
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Article archived.");
    onSaved();
  }

  async function doRestore() {
    setBusy(true);
    const res = await restoreArticleToDraft(article.id);
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Article restored to draft.");
    onSaved();
  }

  function tryClose() {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    onClose();
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Editing</span>
        <span className="truncate text-sm font-semibold">{article.title}</span>
        <Badge variant="outline" className="h-5">{STATUS_LABEL[article.status] ?? article.status}</Badge>
        <Badge variant="outline" className="h-5">rev {article.revision_number}</Badge>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {dirty ? (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300">Unsaved changes</span>
          ) : (
            <span className="text-muted-foreground">Up to date</span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <MarkdownEditor value={content} onChange={setContent} rows={20} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
        <Button variant="ghost" size="sm" onClick={tryClose} disabled={busy}>
          <X className="mr-1 h-3.5 w-3.5" /> Close editor
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canUpdate && (
            <Button variant="secondary" size="sm" onClick={() => void save()} disabled={!dirty || busy}>
              <Save className="mr-1 h-3.5 w-3.5" /> Save draft
            </Button>
          )}
          {canUpdate && article.status !== "published" && (
            <Button size="sm" onClick={() => void doPublish()} disabled={busy}>
              <Send className="mr-1 h-3.5 w-3.5" /> Publish
            </Button>
          )}
          {canUpdate && article.status !== "archived" && (
            <Button variant="ghost" size="sm" onClick={() => void doArchive()} disabled={busy}>
              <Archive className="mr-1 h-3.5 w-3.5" /> Archive
            </Button>
          )}
          {canUpdate && article.status === "archived" && (
            <Button variant="ghost" size="sm" onClick={() => void doRestore()} disabled={busy}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restore to draft
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
