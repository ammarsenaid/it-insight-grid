import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Pencil,
  Archive,
  Trash2,
  FolderInput,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Document, Folder } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { can, useRole } from "@/lib/permissions";

interface Props {
  folders: Folder[];
  documents: Document[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onNewRoot: () => void;
  onNewSub: (parentId: string) => void;
  onRename: (folder: Folder) => void;
  onMove: (folder: Folder) => void;
  onArchive: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
}

export function FolderTree(props: Props) {
  const role = useRole();
  const canWrite = can("folders.write", role);
  const canDelete = can("folders.delete", role);
  const roots = props.folders.filter((f) => !f.parentId);
  const totalDocs = props.documents.length;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Folders</div>
        {canWrite && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={props.onNewRoot}
            aria-label="New root folder"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <button
        onClick={() => props.onSelect(null)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
          !props.selected ? "bg-primary/15 text-primary" : "hover:bg-white/[0.03]",
        )}
      >
        <FolderOpen className="h-4 w-4" />
        <span className="flex-1 truncate">All Documents</span>
        <span className="text-[10px] text-muted-foreground">{totalDocs}</span>
      </button>
      <div className="mt-1 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {roots.map((f) => (
          <FolderNode
            key={f.id}
            folder={f}
            depth={0}
            {...props}
            canWrite={canWrite}
            canDelete={canDelete}
          />
        ))}
      </div>
    </div>
  );
}

function FolderNode({
  folder,
  depth,
  folders,
  documents,
  selected,
  onSelect,
  onNewSub,
  onRename,
  onMove,
  onArchive,
  onDelete,
  canWrite,
  canDelete,
}: Props & { folder: Folder; depth: number; canWrite: boolean; canDelete: boolean }) {
  const [open, setOpen] = useState(depth < 1);
  const children = folders.filter((f) => f.parentId === folder.id);
  const count = documents.filter((d) => d.folderId === folder.id).length;
  const active = selected === folder.id;
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-0.5 rounded-lg pr-1 transition-colors",
          active ? "bg-primary/15 text-primary" : "hover:bg-white/[0.03]",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn("grid h-6 w-6 place-items-center text-muted-foreground", !hasChildren && "invisible")}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => onSelect(folder.id)}
          className="flex flex-1 items-center gap-2 py-1.5 text-left text-xs"
          style={{ paddingLeft: depth * 12 }}
        >
          <FolderIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{folder.name}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{count}</span>
        </button>
        {(canWrite || canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {canWrite && (
                <>
                  <DropdownMenuItem onClick={() => onNewSub(folder.id)}>
                    <Plus className="mr-2 h-3.5 w-3.5" /> New subfolder
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRename(folder)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onMove(folder)}>
                    <FolderInput className="mr-2 h-3.5 w-3.5" /> Move…
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onArchive(folder)}>
                    <Archive className="mr-2 h-3.5 w-3.5" /> Archive contents
                  </DropdownMenuItem>
                </>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => onDelete(folder)}>
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {open && hasChildren && (
        <div className="ml-3 border-l border-border/30 pl-1">
          {children.map((c) => (
            <FolderNode
              key={c.id}
              folder={c}
              depth={depth + 1}
              folders={folders}
              documents={documents}
              selected={selected}
              onSelect={onSelect}
              onNewRoot={() => undefined}
              onNewSub={onNewSub}
              onRename={onRename}
              onMove={onMove}
              onArchive={onArchive}
              onDelete={onDelete}
              canWrite={canWrite}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
