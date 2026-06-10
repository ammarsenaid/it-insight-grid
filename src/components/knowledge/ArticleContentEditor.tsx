import { useEffect, useRef, useState } from "react";
import { Save, Send, RotateCcw, X, CheckCircle2, XCircle, Upload, ArrowLeftCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownEditor } from "@/components/common/MarkdownEditor";
import { updateArticle } from "@/lib/knowledge/mutations";
import {
  approveForPublication,
  archiveArticle,
  publishApproved,
  requestChanges,
  restoreArticleToDraft,
  submitForReview,
  withdrawFromReview,
} from "@/lib/knowledge/review";
import type { KbArticle } from "@/lib/knowledge/backend-types";

interface Props {
  article: KbArticle;
  canUpdate: boolean;
  canDelete: boolean;
  /** True for users that can approve / request changes (team.manage). */
  canApprove: boolean;
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

type CommentPrompt =
  | { kind: "submit"; required: false }
  | { kind: "approve"; required: false }
  | { kind: "request_changes"; required: true }
  | { kind: "publish"; required: false }
  | { kind: "withdraw"; required: false }
  | null;

const PROMPT_META: Record<Exclude<NonNullable<CommentPrompt>["kind"], never>, { title: string; description: string; confirmLabel: string; placeholder: string }> = {
  submit: {
    title: "Submit for review",
    description: "Send this draft to reviewers. Add an optional note for them.",
    confirmLabel: "Submit",
    placeholder: "Optional note for reviewers…",
  },
  approve: {
    title: "Approve article",
    description: "Mark this article as approved. An editor can then publish it.",
    confirmLabel: "Approve",
    placeholder: "Optional comment…",
  },
  request_changes: {
    title: "Request changes",
    description: "Send the article back to draft with feedback. A comment is required.",
    confirmLabel: "Request changes",
    placeholder: "Describe what needs to change…",
  },
  publish: {
    title: "Publish article",
    description: "Publish the approved article so the team can read it.",
    confirmLabel: "Publish",
    placeholder: "Optional release note…",
  },
  withdraw: {
    title: "Withdraw from review",
    description: "Return this article to draft without a decision.",
    confirmLabel: "Withdraw",
    placeholder: "Optional note…",
  },
};

/**
 * Inline Markdown editor for an existing article with review workflow
 * controls. Title/metadata changes use the ArticleFormDialog.
 */
export function ArticleContentEditor({ article, canUpdate, canApprove, onSaved, onClose }: Props) {
  const [content, setContent] = useState(article.content_markdown ?? "");
  const [title, setTitle] = useState(article.title ?? "");
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<CommentPrompt>(null);
  const [comment, setComment] = useState("");
  const initialRef = useRef(article.content_markdown ?? "");
  const initialTitleRef = useRef(article.title ?? "");
  const dirtyRef = useRef(false);

  useEffect(() => {
    initialRef.current = article.content_markdown ?? "";
    initialTitleRef.current = article.title ?? "";
    setContent(article.content_markdown ?? "");
    setTitle(article.title ?? "");
    dirtyRef.current = false;
  }, [article.id, article.content_markdown, article.title]);

  const trimmedTitle = title.trim();
  const titleInvalid = trimmedTitle.length === 0;
  const titleDirty = trimmedTitle !== initialTitleRef.current.trim();
  const contentDirty = content !== initialRef.current;
  const dirty = contentDirty || titleDirty;
  dirtyRef.current = dirty;

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

  async function saveDraft() {
    if (busy || !dirty) return;
    if (titleInvalid) {
      toast.error("Title cannot be empty.");
      return;
    }
    setBusy(true);
    const patch: { id: string; contentMarkdown?: string; title?: string } = { id: article.id };
    if (contentDirty) patch.contentMarkdown = content;
    if (titleDirty) patch.title = trimmedTitle;
    const res = await updateArticle(patch);
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    initialRef.current = content;
    initialTitleRef.current = trimmedTitle;
    setTitle(trimmedTitle);
    toast.success("Draft saved.");
    onSaved();
  }

  async function doArchive() {
    setBusy(true);
    const res = await archiveArticle(article);
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Article archived.");
    onSaved();
  }

  async function doRestore() {
    setBusy(true);
    const res = await restoreArticleToDraft(article);
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Article restored to draft.");
    onSaved();
  }

  function openPrompt(p: CommentPrompt) {
    setComment("");
    setPrompt(p);
  }

  async function confirmPrompt() {
    if (!prompt) return;
    const trimmed = comment.trim();
    if (prompt.required && !trimmed) {
      toast.error("A comment is required.");
      return;
    }
    setBusy(true);

    // Persist any pending body changes first so reviewers see the latest content.
    if (dirty && (prompt.kind === "submit" || prompt.kind === "publish")) {
      if (titleInvalid) {
        setBusy(false);
        toast.error("Title cannot be empty.");
        return;
      }
      const patch: { id: string; contentMarkdown?: string; title?: string } = { id: article.id };
      if (contentDirty) patch.contentMarkdown = content;
      if (titleDirty) patch.title = trimmedTitle;
      const saveRes = await updateArticle(patch);
      if (saveRes.error) {
        setBusy(false);
        toast.error(saveRes.error);
        return;
      }
      initialRef.current = content;
      initialTitleRef.current = trimmedTitle;
    }

    let res;
    switch (prompt.kind) {
      case "submit": res = await submitForReview(article, trimmed || null); break;
      case "approve": res = await approveForPublication(article, trimmed || null); break;
      case "request_changes": res = await requestChanges(article, trimmed); break;
      case "publish": res = await publishApproved(article, trimmed || null); break;
      case "withdraw": res = await withdrawFromReview(article, trimmed || null); break;
    }
    setBusy(false);

    if (res?.error) {
      // updateArticle may have succeeded while the event insert failed —
      // surface the message so the user can retry the audit log entry.
      toast.error(res.error);
      if (res.data) onSaved();
      return;
    }

    const successMsg: Record<typeof prompt.kind, string> = {
      submit: "Submitted for review.",
      approve: "Article approved.",
      request_changes: "Changes requested.",
      publish: "Article published.",
      withdraw: "Withdrawn from review.",
    };
    toast.success(successMsg[prompt.kind]);
    setPrompt(null);
    onSaved();
  }

  function tryClose() {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    onClose();
  }

  const status = article.status;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Editing</span>
        <Badge variant="outline" className="h-5">{STATUS_LABEL[status] ?? status}</Badge>
        <Badge variant="outline" className="h-5">rev {article.revision_number}</Badge>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {dirty ? (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300">Unsaved changes</span>
          ) : (
            <span className="text-muted-foreground">Up to date</span>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="kb-article-title" className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Article title
        </Label>
        <Input
          id="kb-article-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled article"
          maxLength={200}
          disabled={!canUpdate || status === "archived" || busy}
          aria-invalid={titleInvalid}
          className={`h-9 text-base font-semibold ${titleInvalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
        />
        {titleInvalid && (
          <p className="text-xs text-destructive">Title is required.</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <MarkdownEditor value={content} onChange={setContent} rows={20} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
        <Button variant="ghost" size="sm" onClick={tryClose} disabled={busy}>
          <X className="mr-1 h-3.5 w-3.5" /> Close editor
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canUpdate && status !== "archived" && (
            <Button variant="secondary" size="sm" onClick={() => void saveDraft()} disabled={!dirty || busy || titleInvalid}>
              <Save className="mr-1 h-3.5 w-3.5" /> Save draft
            </Button>
          )}

          {/* Workflow actions */}
          {canUpdate && status === "draft" && (
            <Button size="sm" onClick={() => openPrompt({ kind: "submit", required: false })} disabled={busy || titleInvalid}>
              <Send className="mr-1 h-3.5 w-3.5" /> Submit for review
            </Button>
          )}
          {canUpdate && status === "in_review" && (
            <Button variant="ghost" size="sm" onClick={() => openPrompt({ kind: "withdraw", required: false })} disabled={busy}>
              <ArrowLeftCircle className="mr-1 h-3.5 w-3.5" /> Withdraw
            </Button>
          )}
          {canApprove && status === "in_review" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => openPrompt({ kind: "request_changes", required: true })} disabled={busy}>
                <XCircle className="mr-1 h-3.5 w-3.5" /> Request changes
              </Button>
              <Button size="sm" onClick={() => openPrompt({ kind: "approve", required: false })} disabled={busy}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
              </Button>
            </>
          )}
          {canApprove && status === "approved" && (
            <Button variant="ghost" size="sm" onClick={() => openPrompt({ kind: "request_changes", required: true })} disabled={busy}>
              <XCircle className="mr-1 h-3.5 w-3.5" /> Request changes
            </Button>
          )}
          {canUpdate && status === "approved" && (
            <Button size="sm" onClick={() => openPrompt({ kind: "publish", required: false })} disabled={busy || titleInvalid}>
              <Upload className="mr-1 h-3.5 w-3.5" /> Publish
            </Button>
          )}

          {canUpdate && status === "archived" && (
            <Button variant="ghost" size="sm" onClick={() => void doRestore()} disabled={busy}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restore to draft
            </Button>
          )}
        </div>
      </div>


      <Dialog open={!!prompt} onOpenChange={(o) => { if (!o) setPrompt(null); }}>
        <DialogContent className="sm:max-w-md">
          {prompt && (
            <>
              <DialogHeader>
                <DialogTitle>{PROMPT_META[prompt.kind].title}</DialogTitle>
                <DialogDescription>{PROMPT_META[prompt.kind].description}</DialogDescription>
              </DialogHeader>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={PROMPT_META[prompt.kind].placeholder}
                rows={4}
                maxLength={2000}
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPrompt(null)} disabled={busy}>Cancel</Button>
                <Button onClick={() => void confirmPrompt()} disabled={busy || (prompt.required && !comment.trim())}>
                  {PROMPT_META[prompt.kind].confirmLabel}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
