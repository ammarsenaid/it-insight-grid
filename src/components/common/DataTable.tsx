import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type TableDensity = "comfortable" | "compact" | "dense";

const DENSITY: Record<TableDensity, { cell: string; head: string; text: string }> = {
  comfortable: { cell: "py-3 px-3", head: "py-3 px-3", text: "text-sm" },
  compact: { cell: "py-2 px-3", head: "py-2 px-3", text: "text-[13px]" },
  dense: { cell: "py-1.5 px-2", head: "py-1.5 px-2", text: "text-xs" },
};

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  /** Sticks this column to the left/right edge while horizontally scrolling. */
  sticky?: "left" | "right";
  render: (row: T) => ReactNode;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  onRowClick,
  emptyState,
  density = "comfortable",
  stickyHeader = true,
  className,
}: {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  pageSizeOptions?: number[];
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  density?: TableDensity;
  stickyHeader?: boolean;
  className?: string;
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const rows = useMemo(
    () => data.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [data, safePage, pageSize],
  );
  const d = DENSITY[density];

  if (data.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div className={cn("glass-card overflow-hidden rounded-2xl", className)}>
      <div className="dt-scroll relative max-h-[68vh] overflow-auto">
        <Table className={d.text}>
          <TableHeader
            className={cn(
              stickyHeader && "sticky top-0 z-20 bg-card/95 backdrop-blur",
              stickyHeader && "shadow-[0_1px_0_hsl(var(--border))]",
            )}
          >
            <TableRow className="border-border/60 hover:bg-transparent">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80",
                    d.head,
                    c.sticky === "left" && "sticky left-0 z-30 bg-card/95 backdrop-blur",
                    c.sticky === "right" && "sticky right-0 z-30 bg-card/95 backdrop-blur",
                    c.className,
                  )}
                >
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "border-border/40 transition-colors",
                  onRowClick && "cursor-pointer hover:bg-white/[0.03]",
                )}
              >
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      d.cell,
                      c.sticky === "left" && "sticky left-0 z-10 bg-card/95 backdrop-blur",
                      c.sticky === "right" && "sticky right-0 z-10 bg-card/95 backdrop-blur",
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-stretch gap-2 border-t border-border/40 px-3 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline">
            {data.length === 0
              ? "0 records"
              : <>Showing <span className="font-mono text-foreground">{safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, data.length)}</span> of <span className="font-mono text-foreground">{data.length}</span></>}
          </span>
          <span className="sm:hidden font-mono text-foreground">{data.length} total</span>
          {pageSizeOptions.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="hidden sm:inline">Rows</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                <SelectTrigger className="h-7 w-[68px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((n) => <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={safePage === 0} onClick={() => setPage(0)} aria-label="First page">
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="Previous page">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="px-2 font-mono text-foreground">{safePage + 1} / {totalPages}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} aria-label="Next page">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)} aria-label="Last page">
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
