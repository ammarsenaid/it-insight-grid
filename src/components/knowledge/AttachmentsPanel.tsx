import { useEffect, useRef, useState } from "react";
import { Paperclip, Upload, Trash2, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/components/common/format";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  deleteAttachment,
  getAttachmentDownloadUrl,
  isAllowedMime,
  listAttachments,
  MAX_ATTACHMENT_BYTES,
  uploadAttachment,
  type KbAttachment,
} from "@/lib/knowledge/attachments";

interface Props {
  articleId: string;
  teamId: string;
  canUpdate: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsPanel({ articleId, teamId, canUpdate }: Props) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; items: KbAttachment[] }>({
    loading: true, error: null, items: [],
  });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<KbAttachment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setState((s) => ({ ...s, loading: true, error: null }));
    const res = await listAttachments(articleId);
    if (res.error) setState({ loading: false, error: res.error, items: [] });
    else setState({ loading: false, error: null, items: res.data ?? [] });
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [articleId]);

  async function onPick(file: File | null | undefined) {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(`File exceeds ${(MAX_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0)} MB limit.`);
      return;
    }
    const mime = file.type || "application/octet-stream";
    if (!isAllowedMime(mime)) {
      toast.error("Unsupported file type.");
      return;
    }
    setBusy(true);
    const res = await uploadAttachment({ teamId, articleId, file });
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success(`Uploaded ${file.name}.`);
    if (fileRef.current) fileRef.current.value = "";
    void load();
  }

  async function onDownload(att: KbAttachment) {
    const res = await getAttachmentDownloadUrl(att.storage_path);
    if (res.error || !res.data) { toast.error(res.error ?? "Could not generate link."); return; }
    window.open(res.data, "_blank", "noopener,noreferrer");
  }

  async function onDelete(att: KbAttachment) {
    setBusy(true);
    const res = await deleteAttachment(att);
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Attachment deleted.");
    void load();
  }

  return (
    <section className="rounded-xl border border-border/40 bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center gap-2">
        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Attachments
        </span>
        <span className="text-[11px] text-muted-foreground">({state.items.length})</span>
        {canUpdate && (
          <div className="ml-auto">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept={ALLOWED_ATTACHMENT_MIME_TYPES.join(",")}
              onChange={(e) => void onPick(e.target.files?.[0])}
            />
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-1 h-3 w-3" /> Upload file
            </Button>
          </div>
        )}
      </div>

      {state.loading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : state.error ? (
        <div className="text-xs text-destructive">{state.error}</div>
      ) : state.items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
          {canUpdate ? "No attachments yet. Upload your first file." : "No attachments."}
        </div>
      ) : (
        <ul className="divide-y divide-border/30 text-sm">
          {state.items.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-1.5">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.file_name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {formatBytes(a.size_bytes)} · {a.mime_type} · {formatDate(a.created_at)}
                </div>
              </div>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void onDownload(a)}>
                <Download className="mr-1 h-3 w-3" /> Download
              </Button>
              {canUpdate && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-destructive"
                  disabled={busy}
                  onClick={() => setConfirmDel(a)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {confirmDel && (
        <ConfirmDialog
          open={!!confirmDel}
          onOpenChange={(o) => { if (!o) setConfirmDel(null); }}
          title="Delete attachment"
          description={`Permanently delete "${confirmDel.file_name}"? This cannot be undone.`}
          destructive
          confirmLabel="Delete"
          onConfirm={() => {
            const a = confirmDel;
            setConfirmDel(null);
            if (a) void onDelete(a);
          }}
        />
      )}
    </section>
  );
}
