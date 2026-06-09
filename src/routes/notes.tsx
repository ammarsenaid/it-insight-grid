import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus, StickyNote, Edit, Trash2, Copy, Download } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDrawer } from "@/components/common/FormDrawer";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { setState, logActivity, trashItem, uid, useData } from "@/lib/data/store";
import type { Note } from "@/lib/data/types";
import { toast } from "sonner";
import { formatDate } from "@/components/common/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notes")({
  head: () => ({ meta: [{ title: "Notes · IT Knowledge Center" }] }),
  component: NotesPage,
});

const empty = (): Omit<Note, "id" | "createdAt" | "updatedAt"> => ({ title: "", category: "General", content: "", linkedDocumentId: undefined });

function NotesPage() {
  const data = useData();
  const [selectedId, setSelectedId] = useState<string | null>(data.notes[0]?.id ?? null);
  const [q, setQ] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return data.notes.filter((n) => !ql || n.title.toLowerCase().includes(ql) || n.content.toLowerCase().includes(ql));
  }, [data.notes, q]);

  const selected = data.notes.find((n) => n.id === selectedId);
  const cats = new Set(data.notes.map((n) => n.category)).size;
  const linked = data.notes.filter((n) => n.linkedDocumentId).length;
  const standalone = data.notes.length - linked;
  const recent = data.notes.filter((n) => Date.now() - new Date(n.updatedAt).getTime() < 7 * 86400000).length;

  const openCreate = () => { setEditId(null); setForm(empty()); setDrawerOpen(true); };
  const openEdit = (n: Note) => { setEditId(n.id); setForm({ ...n }); setDrawerOpen(true); };

  const save = () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    setState((s) => {
      if (editId) return { ...s, notes: s.notes.map((n) => n.id === editId ? { ...n, ...form, updatedAt: new Date().toISOString() } : n) };
      const next: Note = { id: uid("nte"), ...form, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      return { ...s, notes: [next, ...s.notes] };
    });
    logActivity(editId ? "note.update" : "note.create", `${editId ? "Updated" : "Created"} note '${form.title}'`);
    toast.success("Saved");
    setDrawerOpen(false);
  };

  const remove = (id: string) => {
    const n = data.notes.find((x) => x.id === id);
    if (!n) return;
    trashItem("note", n.title, "Notes", n, n.content.length);
    setState((s) => ({ ...s, notes: s.notes.filter((x) => x.id !== id) }));
    if (selectedId === id) setSelectedId(null);
    toast.success("Moved to recycle bin");
  };

  const duplicate = (n: Note) => {
    const copy: Note = { ...n, id: uid("nte"), title: n.title + " (copy)", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setState((s) => ({ ...s, notes: [copy, ...s.notes] }));
    toast.success("Duplicated");
  };

  const exportMd = (n: Note) => {
    const blob = new Blob([n.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${n.title}.md`; a.click(); URL.revokeObjectURL(url);
    toast.success("Exported");
  };

  return (
    <div>
      <PageHeader title="Notes" description="Quick internal notes and references."
        actions={<Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" /> New Note</Button>} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MetricCard icon={StickyNote} label="Total" value={data.notes.length} accent="primary" />
        <MetricCard icon={StickyNote} label="Linked" value={linked} accent="success" />
        <MetricCard icon={StickyNote} label="Standalone" value={standalone} accent="muted" />
        <MetricCard icon={StickyNote} label="Categories" value={cats} accent="primary" />
        <MetricCard icon={StickyNote} label="Updated 7d" value={recent} accent="warning" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="glass-card rounded-2xl p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search notes..." className="mb-2" />
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {filtered.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted-foreground">No notes</div>}
            {filtered.map((n) => (
              <button key={n.id} onClick={() => setSelectedId(n.id)}
                className={cn("w-full rounded-lg px-3 py-2 text-left transition", selectedId === n.id ? "bg-primary/15 text-primary" : "hover:bg-white/[0.03]")}>
                <div className="truncate text-sm font-medium">{n.title}</div>
                <div className="truncate text-[10px] text-muted-foreground">{n.category} · {formatDate(n.updatedAt)}</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="glass-card rounded-2xl p-5">
          {selected ? (
            <>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{selected.title}</h2>
                  <div className="text-xs text-muted-foreground">{selected.category} · Updated {formatDate(selected.updatedAt)}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(selected)}><Edit className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => duplicate(selected)}><Copy className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => exportMd(selected)}><Download className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(selected.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <pre className="whitespace-pre-wrap rounded-xl border border-border/40 bg-background/40 p-4 text-sm leading-relaxed">{selected.content}</pre>
            </>
          ) : (
            <EmptyState icon={StickyNote} title="No note selected" description="Pick a note from the list or create a new one." actionLabel="New Note" onAction={openCreate} />
          )}
        </section>
      </div>

      <FormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title={editId ? "Edit Note" : "New Note"} onSubmit={save}>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label className="text-xs">Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Linked document</Label>
            <Select value={form.linkedDocumentId ?? "none"} onValueChange={(v) => setForm({ ...form, linkedDocumentId: v === "none" ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent><SelectItem value="none">None</SelectItem>{data.documents.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Content (Markdown)</Label><Textarea rows={12} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
        </div>
      </FormDrawer>

      <ConfirmDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)} title="Delete note?" destructive confirmLabel="Delete"
        onConfirm={() => { if (confirmDelete) remove(confirmDelete); setConfirmDelete(null); }} />
    </div>
  );
}
