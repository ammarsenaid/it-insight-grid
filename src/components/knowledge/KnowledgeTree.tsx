import { useState, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  Library,
  Book,
  FolderTree as ChapterIcon,
  FileText,
  Star,
  MoreHorizontal,
  Plus,
  Pencil,
  Copy as CopyIcon,
  FolderInput,
  Archive,
  Trash2,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { KnowledgeNode, KnowledgeNodeType } from "@/lib/knowledge/types";

const ICONS: Record<KnowledgeNodeType, typeof Library> = {
  space: Library,
  book: Book,
  chapter: ChapterIcon,
  page: FileText,
};

export interface TreeActions {
  onSelect: (id: string) => void;
  onNewChild: (parent: KnowledgeNode, type: KnowledgeNodeType) => void;
  onNewSpace: () => void;
  onRename: (node: KnowledgeNode) => void;
  onEditDetails: (node: KnowledgeNode) => void;
  onMove: (node: KnowledgeNode) => void;
  onDuplicate: (node: KnowledgeNode) => void;
  onArchive: (node: KnowledgeNode) => void;
  onDelete: (node: KnowledgeNode) => void;
  onFavorite: (node: KnowledgeNode) => void;
  onCopyLink: (node: KnowledgeNode) => void;
}

export function KnowledgeTree({
  nodes,
  selectedId,
  query,
  actions,
}: {
  nodes: KnowledgeNode[];
  selectedId: string | null;
  query: string;
  actions: TreeActions;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    nodes.filter((n) => n.type === "space").forEach((n) => s.add(n.id));
    return s;
  });

  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, KnowledgeNode[]>();
    nodes.forEach((n) => {
      const arr = m.get(n.parentId) ?? [];
      arr.push(n);
      m.set(n.parentId, arr);
    });
    m.forEach((arr) =>
      arr.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    );
    return m;
  }, [nodes]);

  const q = query.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (!q) return null;
    const matches = new Set<string>();
    nodes.forEach((n) => {
      if (
        n.title.toLowerCase().includes(q) ||
        (n.description ?? "").toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        matches.add(n.id);
        // also include ancestors so they remain visible
        let cur = n;
        while (cur.parentId) {
          matches.add(cur.parentId);
          const next = nodes.find((x) => x.id === cur.parentId);
          if (!next) break;
          cur = next;
        }
      }
    });
    return matches;
  }, [nodes, q]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const roots = childrenByParent.get(null) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Knowledge
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={actions.onNewSpace}>
          <Plus className="mr-1 h-3 w-3" /> Space
        </Button>
      </div>
      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        {roots.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground">
            No knowledge spaces yet.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {roots.map((n) => (
              <TreeRow
                key={n.id}
                node={n}
                depth={0}
                expanded={expanded}
                toggle={toggle}
                childrenByParent={childrenByParent}
                selectedId={selectedId}
                matchIds={matchIds}
                actions={actions}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  toggle,
  childrenByParent,
  selectedId,
  matchIds,
  actions,
}: {
  node: KnowledgeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  childrenByParent: Map<string | null, KnowledgeNode[]>;
  selectedId: string | null;
  matchIds: Set<string> | null;
  actions: TreeActions;
}) {
  const children = childrenByParent.get(node.id) ?? [];
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(node.id) || !!matchIds;
  const Icon = ICONS[node.type];
  const visible = !matchIds || matchIds.has(node.id);
  if (!visible) return null;
  const selected = selectedId === node.id;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md px-1 py-1 text-sm hover:bg-white/[0.04]",
          selected && "bg-primary/15 text-primary",
        )}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          onClick={() => (hasChildren ? toggle(node.id) : actions.onSelect(node.id))}
          aria-label={hasChildren ? (isOpen ? "Collapse" : "Expand") : "Open"}
        >
          {hasChildren ? (
            isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <span className="block h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => actions.onSelect(node.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="truncate">{node.title}</span>
          {node.favorite && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
          {hasChildren && (
            <span className="ml-auto pl-1 text-[10px] text-muted-foreground/70">
              {children.length}
            </span>
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
              aria-label="More"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {node.type}
            </DropdownMenuLabel>
            {node.type === "space" && (
              <>
                <DropdownMenuItem onClick={() => actions.onNewChild(node, "book")}>
                  <Plus className="mr-2 h-3.5 w-3.5" /> New Book
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.onNewChild(node, "page")}>
                  <Plus className="mr-2 h-3.5 w-3.5" /> New Page
                </DropdownMenuItem>
              </>
            )}
            {node.type === "book" && (
              <>
                <DropdownMenuItem onClick={() => actions.onNewChild(node, "chapter")}>
                  <Plus className="mr-2 h-3.5 w-3.5" /> New Chapter
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.onNewChild(node, "page")}>
                  <Plus className="mr-2 h-3.5 w-3.5" /> New Page
                </DropdownMenuItem>
              </>
            )}
            {node.type === "chapter" && (
              <>
                <DropdownMenuItem onClick={() => actions.onNewChild(node, "page")}>
                  <Plus className="mr-2 h-3.5 w-3.5" /> New Page
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.onNewChild(node, "chapter")}>
                  <Plus className="mr-2 h-3.5 w-3.5" /> New Subchapter
                </DropdownMenuItem>
              </>
            )}
            {node.type === "page" && (
              <DropdownMenuItem onClick={() => actions.onNewChild(node, "page")}>
                <Plus className="mr-2 h-3.5 w-3.5" /> New Subpage
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => actions.onRename(node)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onEditDetails(node)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onMove(node)}>
              <FolderInput className="mr-2 h-3.5 w-3.5" /> Move
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onDuplicate(node)}>
              <CopyIcon className="mr-2 h-3.5 w-3.5" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onCopyLink(node)}>
              <LinkIcon className="mr-2 h-3.5 w-3.5" /> Copy link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onFavorite(node)}>
              <Star className="mr-2 h-3.5 w-3.5" />
              {node.favorite ? "Remove favorite" : "Add to favorites"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => actions.onArchive(node)}>
              <Archive className="mr-2 h-3.5 w-3.5" /> Archive
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => actions.onDelete(node)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {hasChildren && isOpen && (
        <ul className="space-y-0.5">
          {children.map((c) => (
            <TreeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              childrenByParent={childrenByParent}
              selectedId={selectedId}
              matchIds={matchIds}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
