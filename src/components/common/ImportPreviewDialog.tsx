import { useState, type ChangeEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileText } from "lucide-react";
import { parseCSV } from "@/lib/csv";
import { toast } from "sonner";

export function ImportPreviewDialog({
  open,
  onOpenChange,
  title,
  description,
  expectedHeaders,
  onImport,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  expectedHeaders: string[];
  onImport: (rows: Record<string, string>[]) => unknown | Promise<unknown>;
}) {
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    try {
      const text = await f.text();
      setParsed(parseCSV(text));
    } catch {
      setParsed(null);
      toast.error("The CSV file could not be parsed.");
    }
  };

  const reset = () => { setParsed(null); setFileName(""); };

  const handleImport = async () => {
    if (!parsed || isImporting) return;
    setIsImporting(true);
    try {
      const result = await onImport(parsed.rows);
      if (result === false) return;
      const count = typeof result === "number" ? result : parsed.rows.length;
      toast.success(`Imported ${count} record${count === 1 ? "" : "s"}`);
      reset();
      onOpenChange(false);
    } catch {
      // The caller owns sanitized mutation error reporting.
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (isImporting) return;
      onOpenChange(o);
      if (!o) reset();
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {!parsed ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 p-8 text-center">
            <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Upload a CSV with headers: <span className="font-mono text-xs text-foreground">{expectedHeaders.join(", ")}</span>
            </p>
            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-1.5 text-sm hover:bg-card">
              <Upload className="h-3.5 w-3.5" /> Choose CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            </label>
          </div>
        ) : (
          <div>
            <div className="mb-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{fileName}</span> · {parsed.rows.length} rows · {parsed.headers.length} columns
            </div>
            <div className="max-h-[300px] overflow-auto rounded-xl border border-border/40">
              <table className="w-full text-xs">
                <thead className="bg-card/60">
                  <tr>
                    {parsed.headers.map((h) => (
                      <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-t border-border/30">
                      {parsed.headers.map((h) => (
                        <td key={h} className="px-2 py-1 font-mono text-[11px]">{r[h] || "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 20 && (
                <div className="px-2 py-1.5 text-center text-[10px] text-muted-foreground">+ {parsed.rows.length - 20} more rows</div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {parsed && <Button variant="ghost" onClick={reset} disabled={isImporting}>Choose another file</Button>}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isImporting}>Cancel</Button>
          <Button onClick={() => void handleImport()} disabled={!parsed || parsed.rows.length === 0 || isImporting}>
            {isImporting ? "Importing..." : <>Import {parsed && `(${parsed.rows.length})`}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
