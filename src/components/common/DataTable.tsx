import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  pageSize = 10,
  onRowClick,
  emptyState,
}: {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const rows = useMemo(
    () => data.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [data, safePage, pageSize],
  );

  if (data.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div className="glass-card overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card/80 backdrop-blur">
            <TableRow className="border-border/60 hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className={cn("text-[11px] uppercase tracking-wider text-muted-foreground/80", c.className)}>
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
                className={cn("border-border/40 transition-colors", onRowClick && "cursor-pointer hover:bg-white/[0.03]")}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn("text-sm", c.className)}>
                    {c.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/40 px-4 py-3 text-xs text-muted-foreground">
          <div>
            Showing {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, data.length)} of {data.length}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 font-mono">
              {safePage + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
