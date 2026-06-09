import { useRef, useState } from "react";
import { Bold, Italic, Heading, List, ListOrdered, Code, Link as LinkIcon, CheckSquare, Quote, Eye, Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";

type Tool = { icon: typeof Bold; label: string; before: string; after?: string; block?: boolean };

const TOOLS: Tool[] = [
  { icon: Bold, label: "Bold", before: "**", after: "**" },
  { icon: Italic, label: "Italic", before: "*", after: "*" },
  { icon: Heading, label: "Heading", before: "## ", block: true },
  { icon: List, label: "Bulleted list", before: "- ", block: true },
  { icon: ListOrdered, label: "Numbered list", before: "1. ", block: true },
  { icon: CheckSquare, label: "Task", before: "- [ ] ", block: true },
  { icon: Quote, label: "Quote", before: "> ", block: true },
  { icon: Code, label: "Inline code", before: "`", after: "`" },
  { icon: LinkIcon, label: "Link", before: "[", after: "](https://)" },
];

export function MarkdownEditor({
  value,
  onChange,
  rows = 14,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");

  const apply = (t: Tool) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = value.slice(0, start);
    const sel = value.slice(start, end);
    const after = value.slice(end);
    if (t.block) {
      const lineStart = before.lastIndexOf("\n") + 1;
      const next = value.slice(0, lineStart) + t.before + value.slice(lineStart);
      onChange(next);
      setTimeout(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = end + t.before.length;
      }, 0);
      return;
    }
    const wrapped = t.before + (sel || t.label.toLowerCase()) + (t.after ?? "");
    onChange(before + wrapped + after);
    setTimeout(() => {
      el.focus();
      el.selectionStart = start + t.before.length;
      el.selectionEnd = start + t.before.length + (sel || t.label.toLowerCase()).length;
    }, 0);
  };

  return (
    <div className={cn("rounded-xl border border-border/50 bg-background/40", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border/40 px-2 py-1.5">
        {TOOLS.map((t) => (
          <Button
            key={t.label}
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={t.label}
            onClick={() => apply(t)}
          >
            <t.icon className="h-3.5 w-3.5" />
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant={mode === "write" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("write")}
          >
            <Pencil className="mr-1 h-3 w-3" /> Write
          </Button>
          <Button
            type="button"
            variant={mode === "preview" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("preview")}
          >
            <Eye className="mr-1 h-3 w-3" /> Preview
          </Button>
        </div>
      </div>
      {mode === "write" ? (
        <Textarea
          ref={ref}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Write Markdown… **bold**, *italic*, # headings, - lists"}
          className="min-h-[180px] rounded-none border-0 bg-transparent font-mono text-[13px] focus-visible:ring-0"
        />
      ) : (
        <div className="min-h-[180px] px-3 py-3">
          {value.trim() ? (
            <Markdown source={value} />
          ) : (
            <div className="text-xs text-muted-foreground">Nothing to preview.</div>
          )}
        </div>
      )}
    </div>
  );
}
