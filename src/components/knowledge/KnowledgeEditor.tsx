import { useEffect, useRef, useState } from "react";
import { Save, Send, Check, Eye, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/common/MarkdownEditor";
import { Markdown } from "@/components/common/Markdown";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { KnowledgeNode } from "@/lib/knowledge/types";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/knowledge/types";

export function KnowledgeEditor({
  node,
  canPublish,
  onSaveDraft,
  onSubmitReview,
  onApprove,
  onPublish,
  onCancel,
  onRenameTitle,
}: {
  node: KnowledgeNode;
  canPublish: boolean;
  onSaveDraft: (content: string) => void;
  onSubmitReview: (content: string) => void;
  onApprove: (content: string) => void;
  onPublish: (content: string) => void;
  onCancel: () => void;
  onRenameTitle: (title: string) => void;
}) {
  const [title, setTitle] = useState(node.title);
  const [content, setContent] = useState(node.content ?? "");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const dirtyRef = useRef(false);
  const initial = useRef({ title: node.title, content: node.content ?? "" });

  useEffect(() => {
    setTitle(node.title);
    setContent(node.content ?? "");
    initial.current = { title: node.title, content: node.content ?? "" };
    dirtyRef.current = false;
    setSavedAt(null);
  }, [node.id]);

  const dirty = title !== initial.current.title || content !== initial.current.content;
  dirtyRef.current = dirty;

  // Autosave indicator: simulate every 8s if dirty
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => setSavedAt(new Date()), 8000);
    return () => clearTimeout(t);
  }, [dirty, content, title]);

  // Beforeunload warning
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const commitTitle = () => {
    if (title.trim() && title !== initial.current.title) {
      onRenameTitle(title.trim());
      initial.current.title = title.trim();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          className="h-9 max-w-md text-base font-semibold"
          placeholder="Page title"
        />
        <StatusBadge label={STATUS_LABEL[node.status]} tone={STATUS_TONE[node.status]} />
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {dirty ? (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300">
              Unsaved changes
            </span>
          ) : savedAt ? (
            <span>Autosaved {savedAt.toLocaleTimeString()}</span>
          ) : (
            <span>Up to date</span>
          )}
          <div className="flex items-center gap-1 rounded-md border border-border/40 p-0.5">
            <Button
              size="sm"
              variant={mode === "edit" ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setMode("edit")}
            >
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
            <Button
              size="sm"
              variant={mode === "preview" ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setMode("preview")}
            >
              <Eye className="mr-1 h-3 w-3" /> Preview
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {mode === "edit" ? (
          <MarkdownEditor value={content} onChange={setContent} rows={20} />
        ) : (
          <div className="prose-knowledge glass-card rounded-xl p-6">
            <h1 className="mb-2 text-2xl font-semibold">{title}</h1>
            <Markdown source={content} />
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="mr-1 h-3.5 w-3.5" /> Cancel
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => { commitTitle(); onSaveDraft(content); setSavedAt(new Date()); }}>
            <Save className="mr-1 h-3.5 w-3.5" /> Save Draft
          </Button>
          {node.status !== "published" && node.status !== "in_review" && (
            <Button variant="secondary" size="sm" onClick={() => { commitTitle(); onSubmitReview(content); }}>
              <Send className="mr-1 h-3.5 w-3.5" /> Submit for Review
            </Button>
          )}
          {canPublish && node.status === "in_review" && (
            <Button variant="secondary" size="sm" onClick={() => { commitTitle(); onApprove(content); }}>
              <Check className="mr-1 h-3.5 w-3.5" /> Approve
            </Button>
          )}
          {canPublish && (
            <Button size="sm" onClick={() => { commitTitle(); onPublish(content); }}>
              <Check className="mr-1 h-3.5 w-3.5" /> Publish
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
