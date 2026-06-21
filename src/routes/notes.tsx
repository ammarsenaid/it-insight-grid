import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Plus, StickyNote, Edit, Trash2, Copy, Download, Pin, PinOff, Archive,
  FileText, CheckSquare, FileCode, Tag as TagIcon, MoreHorizontal, ArchiveRestore,
  Link2, Server, Network, Ticket as TicketIcon, AlertTriangle,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormDrawer } from "@/components/common/FormDrawer";
import { FormGrid, FormField, FormSection } from "@/components/common/FormGrid";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Markdown } from "@/components/common/Markdown";
import { MarkdownEditor } from "@/components/common/MarkdownEditor";
import { ActivityTimeline } from "@/components/common/ActivityTimeline";
import { RelationPicker, type RelationSelection } from "@/components/common/RelationPicker";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useData } from "@/lib/data/store";
import { convertNoteToDocument, convertNoteToTask, exportNoteMarkdown } from "@/lib/data/notes";
import { notesKeys, notesQuery, noteTemplatesKeys, noteTemplatesQuery } from "@/lib/notes/queries";
import {
  duplicateNote, publicNoteError, saveNote, saveNoteLinks, saveNoteTemplate,
  setNoteArchived, softDeleteNote, softDeleteNoteTemplate, toggleNotePin,
} from "@/lib/notes/notes";
import { NOTE_CATEGORIES, type Note, type NoteInput, type NoteTemplate } from "@/lib/notes/types";
import { toast } from "sonner";
import { formatDate } from "@/components/common/format";
import { cn } from "@/lib/utils";
import { can, useRole } from "@/lib/permissions";

export const Route = createFileRoute("/notes")({
  head: () => ({ meta: [{ title: "Notes · IT Knowledge Center" }] }),
  component: NotesPage,
});

type TabVal = "all" | "pinned" | "archived" | "templates";

interface FormState {
  title: string;
  category: string;
  content: string;
  tags: string;
  pinned: boolean;
  isTemplate: boolean;
  linkedDocumentId: string | null;
}

const empty = (): FormState => ({
  title: "", category: "General", content: "", tags: "", pinned: false, isTemplate: false, linkedDocumentId: null,
});

function NotesPage() {
  const data = useData();
  const role = useRole();
  const writable = can("notes.write", role);
  const qc = useQueryClient();

  const notesQ = useQuery(notesQuery());
  const templatesQ = useQuery(noteTemplatesQuery());
  const notes = useMemo(() => notesQ.data ?? [], [notesQ.data]);
  const templates = useMemo(() => templatesQ.data ?? [], [templatesQ.data]);

  const invalidateNotes = () => qc.invalidateQueries({ queryKey: notesKeys.all });
  const invalidateTemplates = () => qc.invalidateQueries({ queryKey: noteTemplatesKeys.all });

  const [tab, setTab] = useState<TabVal>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("all");
  const [fTag, setFTag] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (input: NoteInput) => saveNote(editId, input),
    onSuccess: async (id) => {
      await invalidateNotes();
      if (!editId) setSelectedId(id);
      toast.success(editId ? "Note updated" : "Note created");
      setDrawerOpen(false);
    },
    onError: (error) => toast.error(publicNoteError(error)),
  });
  const pinMutation = useMutation({
    mutationFn: (id: string) => toggleNotePin(id),
    onSuccess: async (pinned) => { await invalidateNotes(); toast.success(pinned ? "Pinned" : "Unpinned"); },
    onError: (error) => toast.error(publicNoteError(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => setNoteArchived(id, archived),
    onSuccess: async (_data, { archived }) => { await invalidateNotes(); toast.success(archived ? "Archived" : "Restored"); },
    onError: (error) => toast.error(publicNoteError(error)),
  });
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateNote(id),
    onSuccess: async (id) => { await invalidateNotes(); setSelectedId(id); toast.success("Duplicated"); },
    onError: (error) => toast.error(publicNoteError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteNote(id),
    onSuccess: async () => { await invalidateNotes(); toast.success("Note deleted"); },
    onError: (error) => toast.error(publicNoteError(error)),
  });
  const linksMutation = useMutation({
    mutationFn: ({ id, links }: { id: string; links: RelationSelection }) => saveNoteLinks(id, {
      linkedTicketIds: links.ticketIds,
      linkedAssetIds: links.assetIds,
      linkedIpamIds: links.ipamIds,
      linkedTaskIds: links.taskIds,
      linkedUserIds: links.userIds,
    }),
    onSuccess: async () => { await invalidateNotes(); toast.success("Links updated"); },
    onError: (error) => toast.error(publicNoteError(error)),
  });
  const saveTemplateMutation = useMutation({
    mutationFn: (input: { name: string; category: string; content: string }) => saveNoteTemplate(null, input),
    onSuccess: async () => { await invalidateTemplates(); toast.success("Saved as template"); },
    onError: (error) => toast.error(publicNoteError(error)),
  });
  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => softDeleteNoteTemplate(id),
    onSuccess: async () => { await invalidateTemplates(); toast.success("Template deleted"); },
    onError: (error) => toast.error(publicNoteError(error)),
  });

  const allTags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => s.add(t)));
    return Array.from(s);
  }, [notes]);

  const categories = useMemo(() => {
    const s = new Set(NOTE_CATEGORIES);
    notes.forEach((n) => s.add(n.category));
    return Array.from(s);
  }, [notes]);

  const visible = useMemo(() => {
    const ql = q.toLowerCase();
    return notes.filter((n) => {
      if (tab === "pinned" && !n.pinned) return false;
      if (tab === "archived" && !n.archived) return false;
      if (tab === "templates") return false; // templates rendered separately
      if (tab === "all" && n.archived) return false;
      if (fCat !== "all" && n.category !== fCat) return false;
      if (fTag !== "all" && !n.tags.includes(fTag)) return false;
      if (!ql) return true;
      return (
        n.title.toLowerCase().includes(ql) ||
        n.content.toLowerCase().includes(ql) ||
        n.tags.some((t) => t.toLowerCase().includes(ql))
      );
    }).sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [notes, q, tab, fCat, fTag]);

  // pick a default selection
  const selected = notes.find((n) => n.id === selectedId) ?? visible[0] ?? null;

  const pinnedCount = notes.filter((n) => n.pinned && !n.archived).length;
  const archivedCount = notes.filter((n) => n.archived).length;
  const recent = notes.filter((n) => Date.now() - new Date(n.updatedAt).getTime() < 7 * 86400000).length;

  const openCreate = (initial?: Partial<FormState>) => {
    if (!writable) { toast.error("Read-only role"); return; }
    setEditId(null);
    setForm({ ...empty(), ...initial });
    setDrawerOpen(true);
  };
  const openEdit = (n: Note) => {
    setEditId(n.id);
    setForm({
      title: n.title, category: n.category, content: n.content,
      tags: n.tags.join(", "), pinned: n.pinned,
      isTemplate: n.isTemplate, linkedDocumentId: n.linkedDocumentId,
    });
    setDrawerOpen(true);
  };

  const save = () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    const tags = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
    saveMutation.mutate({
      title: form.title.trim(),
      category: form.category,
      content: form.content,
      tags,
      pinned: form.pinned,
      isTemplate: form.isTemplate,
      linkedDocumentId: form.linkedDocumentId,
    });
  };

  const useTemplate = (tpl: NoteTemplate) => {
    openCreate({ title: tpl.name, category: tpl.category, content: tpl.content });
  };

  const relationsValue: RelationSelection = selected ? {
    ticketIds: selected.linkedTicketIds,
    assetIds: selected.linkedAssetIds,
    ipamIds: selected.linkedIpamIds,
    taskIds: selected.linkedTaskIds,
    noteIds: [],
    userIds: selected.linkedUserIds,
  } : { ticketIds: [], assetIds: [], ipamIds: [], taskIds: [], noteIds: [], userIds: [] };

  const linkedTickets = selected ? selected.linkedTicketIds.map((id) => data.tickets.find((t) => t.id === id)).filter(Boolean) : [];
  const linkedAssets = selected ? selected.linkedAssetIds.map((id) => data.assets.find((a) => a.id === id)).filter(Boolean) : [];
  const linkedIps = selected ? selected.linkedIpamIds.map((id) => data.ipam.find((i) => i.id === id)).filter(Boolean) : [];
  const linkedTasks = selected ? selected.linkedTaskIds.map((id) => data.tasks.find((t) => t.id === id)).filter(Boolean) : [];
  const linkedDoc = selected ? data.documents.find((d) => d.id === selected.linkedDocumentId) : undefined;

  const noteActivity = useMemo(() => {
    if (!selected) return [];
    return data.activity.filter((a) => a.entityId === selected.id || a.message.includes(selected.title)).slice(0, 10);
  }, [data.activity, selected]);

  if (notesQ.isError || templatesQ.isError) {
    return (
      <EmptyState icon={AlertTriangle} title="Notes unavailable" description="The shared notes data could not be loaded." actionLabel="Retry"
        onAction={() => { void notesQ.refetch(); void templatesQ.refetch(); }} />
    );
  }

  return (
    <div>
      <PageHeader
        title="Notes"
        description="Capture quick information and turn it into actionable work."
        actions={writable ? (
          <Button onClick={() => openCreate()}><Plus className="mr-1.5 h-4 w-4" /> New note</Button>
        ) : null}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MetricCard icon={StickyNote} label="Total" value={notes.filter((n) => !n.archived).length} accent="primary" />
        <MetricCard icon={Pin} label="Pinned" value={pinnedCount} accent="warning" />
        <MetricCard icon={TagIcon} label="Tags" value={allTags.length} accent="primary" />
        <MetricCard icon={StickyNote} label="Updated 7d" value={recent} accent="success" />
        <MetricCard icon={Archive} label="Archived" value={archivedCount} accent="muted" />
      </div>

      <div className="mt-6 glass-card rounded-2xl p-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabVal)}>
          <TabsList className="bg-background/40">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pinned">Pinned</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "templates" ? (
        <TemplatesPanel
          templates={templates}
          writable={writable}
          onUse={useTemplate}
          onDelete={(id) => deleteTemplateMutation.mutate(id)}
        />
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="glass-card rounded-2xl p-3">
            <SearchInput value={q} onChange={setQ} placeholder="Search notes..." className="mb-2" />
            <div className="mb-2 flex gap-2">
              <Select value={fCat} onValueChange={setFCat}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={fTag} onValueChange={setFTag}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All tags</SelectItem>{allTags.map((t) => <SelectItem key={t} value={t}>#{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="max-h-[65vh] space-y-1 overflow-y-auto">
              {visible.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {notesQ.isLoading ? "Loading notes…" : (q || fCat !== "all" || fTag !== "all") ? "No matching notes" : "No notes yet"}
                </div>
              )}
              {visible.map((n) => (
                <button key={n.id} onClick={() => setSelectedId(n.id)}
                  className={cn("w-full rounded-lg px-3 py-2 text-left transition", selected?.id === n.id ? "bg-primary/15 text-primary" : "hover:bg-white/[0.03]")}>
                  <div className="flex items-center gap-1.5">
                    {n.pinned && <Pin className="h-3 w-3 shrink-0" />}
                    <div className="truncate text-sm font-medium">{n.title}</div>
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">{n.category} · {formatDate(n.updatedAt)}</div>
                  {n.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {n.tags.slice(0, 3).map((t) => <span key={t} className="text-[9px] text-muted-foreground">#{t}</span>)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </aside>

          <section className="glass-card rounded-2xl p-5">
            {selected ? (
              <>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {selected.pinned && <Pin className="h-4 w-4 text-[#F4B96A]" />}
                      <h2 className="truncate text-lg font-semibold">{selected.title}</h2>
                      {selected.archived && <StatusBadge tone="muted" label="archived" />}
                      {selected.isTemplate && <StatusBadge tone="info" label="template" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{selected.category} · Updated {formatDate(selected.updatedAt)} · {selected.owner || "—"}</div>
                    {selected.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {selected.tags.map((t) => <StatusBadge key={t} tone="muted" label={`#${t}`} />)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {writable && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(selected)}><Edit className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => pinMutation.mutate(selected.id)}>
                          {selected.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setLinkOpen(true)}><Link2 className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => exportNoteMarkdown(selected)}><Download className="h-3.5 w-3.5" /></Button>
                    {writable && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="sm" variant="ghost"><MoreHorizontal className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => duplicateMutation.mutate(selected.id)}>
                            <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => saveTemplateMutation.mutate({ name: selected.title, category: selected.category, content: selected.content })}>
                            <FileCode className="mr-2 h-3.5 w-3.5" /> Save as template
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => { convertNoteToDocument(selected); toast.success("Converted to document"); }}>
                            <FileText className="mr-2 h-3.5 w-3.5" /> Convert to document
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { const t = convertNoteToTask(selected); toast.success(`Task created: ${t.title}`); }}>
                            <CheckSquare className="mr-2 h-3.5 w-3.5" /> Convert to task
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {selected.archived ? (
                            <DropdownMenuItem onClick={() => archiveMutation.mutate({ id: selected.id, archived: false })}>
                              <ArchiveRestore className="mr-2 h-3.5 w-3.5" /> Unarchive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => archiveMutation.mutate({ id: selected.id, archived: true })}>
                              <Archive className="mr-2 h-3.5 w-3.5" /> Archive
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(selected.id)}>
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-border/40 bg-background/40 p-4">
                  <Markdown source={selected.content} />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-border/40 bg-background/40 p-3">
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Linked records</h4>
                    {(!linkedDoc && linkedTickets.length === 0 && linkedAssets.length === 0 && linkedIps.length === 0 && linkedTasks.length === 0) ? (
                      <p className="text-xs text-muted-foreground">No linked records.</p>
                    ) : (
                      <ul className="space-y-1 text-xs">
                        {linkedDoc && (
                          <li className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            <Link to="/documents" search={{ article: linkedDoc.id }} className="hover:underline">{linkedDoc.title}</Link></li>
                        )}
                        {linkedTickets.map((tk) => tk && (
                          <li key={tk.id} className="flex items-center gap-2"><TicketIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            <Link to="/tickets/$id" params={{ id: tk.id }} className="hover:underline">{tk.number} · {tk.subject}</Link></li>
                        ))}
                        {linkedAssets.map((a) => a && (
                          <li key={a.id} className="flex items-center gap-2"><Server className="h-3.5 w-3.5 text-muted-foreground" />
                            <Link to="/cmdb" className="hover:underline">{a.hostname}</Link></li>
                        ))}
                        {linkedIps.map((ip) => ip && (
                          <li key={ip.id} className="flex items-center gap-2"><Network className="h-3.5 w-3.5 text-muted-foreground" />
                            <Link to="/ipam" className="hover:underline">{ip.ipAddress}</Link></li>
                        ))}
                        {linkedTasks.map((t) => t && (
                          <li key={t.id} className="flex items-center gap-2"><CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
                            <Link to="/tasks" className="hover:underline">{t.title}</Link></li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-xl border border-border/40 bg-background/40 p-3">
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Activity</h4>
                    <ActivityTimeline entries={noteActivity.map((a) => ({ id: a.id, title: a.message, timestamp: a.createdAt }))} emptyLabel="No recent activity for this note." />
                  </div>
                </div>
              </>
            ) : notes.length === 0 ? (
              <EmptyState
                icon={StickyNote}
                title={notesQ.isLoading ? "Loading notes" : "No notes yet"}
                description={notesQ.isLoading ? "Loading shared note data." : "Capture quick information in markdown. Promote a note into a task or document when it grows up."}
                actionLabel={writable && !notesQ.isLoading ? "Create note" : undefined}
                onAction={writable && !notesQ.isLoading ? () => openCreate() : undefined}
                hint={notesQ.isLoading ? undefined : "Notes support markdown, pins, tags, and templates."}
              />
            ) : (
              <EmptyState icon={StickyNote} title="Select a note" description="Choose a note from the list or create a new one to begin writing." actionLabel={writable ? "Create note" : undefined} onAction={writable ? () => openCreate() : undefined} />
            )}
          </section>
        </div>
      )}

      <FormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title={editId ? "Edit note" : "New note"} onSubmit={save} size="xl">
        <div className="space-y-6">
          <FormSection title="Details" description="Title, category and tags.">
            <FormGrid>
              <FormField label="Title" required full><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></FormField>
              <FormField label="Category">
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </FormField>
              <FormField label="Tags" hint="Comma separated"><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vpn, runbook" /></FormField>
              <FormField label="Linked document" full>
                <Select value={form.linkedDocumentId ?? "none"} onValueChange={(v) => setForm({ ...form, linkedDocumentId: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{data.documents.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent>
                </Select>
              </FormField>
              <FormField full>
                <div className="flex flex-wrap items-center gap-5 rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> Pinned</label>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.isTemplate} onChange={(e) => setForm({ ...form, isTemplate: e.target.checked })} /> Mark as template</label>
                </div>
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Content" description="Write in Markdown. Preview is available in the editor.">
            <MarkdownEditor value={form.content} onChange={(v) => setForm({ ...form, content: v })} rows={18} />
          </FormSection>
        </div>
      </FormDrawer>


      <ConfirmDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)} title="Delete note?" destructive confirmLabel="Delete"
        onConfirm={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete); setConfirmDelete(null); }} />

      <RelationPicker
        open={linkOpen}
        onOpenChange={setLinkOpen}
        value={relationsValue}
        title="Link records to note"
        onSave={(sel) => {
          if (!selected) return;
          linksMutation.mutate({ id: selected.id, links: sel });
        }}
      />
    </div>
  );
}

function TemplatesPanel({
  templates, writable, onUse, onDelete,
}: {
  templates: NoteTemplate[];
  writable: boolean;
  onUse: (tpl: NoteTemplate) => void;
  onDelete: (id: string) => void;
}) {
  if (templates.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState icon={FileCode} title="No templates yet" description="Save any note as a template from its action menu." />
      </div>
    );
  }
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {templates.map((tpl) => (
        <div key={tpl.id} className="glass-card flex flex-col rounded-2xl p-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{tpl.name}</h3>
              <div className="text-[11px] text-muted-foreground">{tpl.category}</div>
            </div>
            <FileCode className="h-4 w-4 text-muted-foreground" />
          </div>
          <pre className="mb-3 max-h-32 overflow-hidden text-[11px] text-muted-foreground">{tpl.content.slice(0, 200)}</pre>
          <div className="mt-auto flex gap-2">
            {writable && <Button size="sm" onClick={() => onUse(tpl)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Use template</Button>}
            {writable && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(tpl.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
