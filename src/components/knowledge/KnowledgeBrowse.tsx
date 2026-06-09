import { useMemo, useState } from "react";
import {
  FileText,
  Book,
  Library,
  FolderTree as ChapterIcon,
  Star,
  Calendar,
  Eye,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDate } from "@/components/common/format";
import type { KnowledgeNode, KnowledgeNodeType } from "@/lib/knowledge/types";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/knowledge/types";
import { cn } from "@/lib/utils";

const ICONS: Record<KnowledgeNodeType, typeof Library> = {
  space: Library,
  book: Book,
  chapter: ChapterIcon,
  page: FileText,
};

const TYPE_LABEL: Record<KnowledgeNodeType, string> = {
  space: "Space",
  book: "Book",
  chapter: "Chapter",
  page: "Page",
};

export function KnowledgeBrowse({
  parent,
  children,
  onOpen,
  onEdit,
}: {
  parent: KnowledgeNode | null;
  children: KnowledgeNode[];
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [view, setView] = useState<"table" | "cards">("table");

  const filtered = useMemo(() => {
    let list = [...children];
    if (typeFilter !== "all") list = list.filter((c) => c.type === typeFilter);
    if (statusFilter !== "all") list = list.filter((c) => c.status === statusFilter);
    const ql = q.trim().toLowerCase();
    if (ql) {
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(ql) ||
          (c.description ?? "").toLowerCase().includes(ql) ||
          c.tags.some((t) => t.toLowerCase().includes(ql)),
      );
    }
    return list;
  }, [children, q, typeFilter, statusFilter]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search this section…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 max-w-xs text-xs"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="book">Books</SelectItem>
            <SelectItem value="chapter">Chapters</SelectItem>
            <SelectItem value="page">Pages</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1 rounded-md border border-border/40 p-0.5">
          <Button
            size="sm"
            variant={view === "table" ? "secondary" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => setView("table")}
          >
            Table
          </Button>
          <Button
            size="sm"
            variant={view === "cards" ? "secondary" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => setView("cards")}
          >
            Cards
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-border/40 p-10 text-center text-xs text-muted-foreground">
            {parent
              ? `No ${parent.type === "space" ? "books or pages" : parent.type === "book" ? "chapters or pages" : "items"} here yet.`
              : "Select a Space, Book, or Chapter on the left."}
          </div>
        ) : view === "table" ? (
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="min-w-full text-sm">
              <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Owner</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                  <th className="px-3 py-2 font-medium">Tags</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.map((n) => {
                  const Icon = ICONS[n.type];
                  return (
                    <tr
                      key={n.id}
                      className="cursor-pointer hover:bg-white/[0.02]"
                      onClick={() => onOpen(n.id)}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{n.title}</span>
                          {n.favorite && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                        </div>
                        {n.description && (
                          <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {n.description}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{TYPE_LABEL[n.type]}</td>
                      <td className="px-3 py-2">
                        <StatusBadge label={STATUS_LABEL[n.status]} tone={STATUS_TONE[n.status]} />
                      </td>
                      <td className="px-3 py-2 text-xs">{n.ownerId}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(n.updatedAt)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {n.tags.slice(0, 2).join(", ") || "—"}
                      </td>
                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        {n.type === "page" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onEdit(n.id)}>
                            <Pencil className="mr-1 h-3 w-3" /> Edit
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((n) => {
              const Icon = ICONS[n.type];
              return (
                <button
                  key={n.id}
                  onClick={() => onOpen(n.id)}
                  className={cn(
                    "glass-card rounded-xl p-4 text-left transition hover:border-primary/40",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      {TYPE_LABEL[n.type]}
                    </div>
                    <StatusBadge label={STATUS_LABEL[n.status]} tone={STATUS_TONE[n.status]} />
                  </div>
                  <div className="line-clamp-1 text-sm font-semibold">{n.title}</div>
                  {n.description && (
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {n.description}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {formatDate(n.updatedAt)}
                    </span>
                    {n.type === "page" && (
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {n.views ?? 0}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
