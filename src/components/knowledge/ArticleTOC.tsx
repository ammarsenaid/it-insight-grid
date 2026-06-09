import { useMemo } from "react";
import { List } from "lucide-react";

export interface TocItem {
  level: number;
  text: string;
  slug: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

export function extractToc(markdown: string): TocItem[] {
  const out: TocItem[] = [];
  if (!markdown) return out;
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let inCode = false;
  for (const raw of lines) {
    if (raw.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (!m) continue;
    const level = m[1].length;
    if (level > 4) continue;
    const text = m[2].trim();
    if (!text) continue;
    out.push({ level, text, slug: slugify(text) });
  }
  return out;
}

export function ArticleTOC({ markdown }: { markdown: string }) {
  const items = useMemo(() => extractToc(markdown), [markdown]);
  if (items.length === 0) {
    return (
      <aside className="min-h-0 overflow-y-auto rounded-xl border border-border/40 bg-white/[0.02] p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <List className="h-3 w-3" /> Outline
        </div>
        <p className="text-xs text-muted-foreground">No headings in this article yet.</p>
      </aside>
    );
  }
  const minLevel = Math.min(...items.map((i) => i.level));
  return (
    <aside className="min-h-0 overflow-y-auto rounded-xl border border-border/40 bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <List className="h-3 w-3" /> Outline
      </div>
      <ul className="space-y-0.5 text-xs">
        {items.map((i, idx) => (
          <li key={`${i.slug}-${idx}`} style={{ paddingLeft: `${(i.level - minLevel) * 10}px` }}>
            <a
              href={`#${i.slug}`}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(i.slug);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="block truncate rounded px-1.5 py-0.5 text-foreground/80 hover:bg-white/[0.04] hover:text-primary"
            >
              {i.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
