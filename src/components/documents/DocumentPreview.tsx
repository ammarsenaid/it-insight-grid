import { fileIconFor, formatBytes } from "@/components/common/format";
import type { Document } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export function DocumentPreview({ doc }: { doc: Document }) {
  const { Icon, color } = fileIconFor(doc.extension);

  if (doc.extension === "md") {
    return <MarkdownPreview content={doc.content} />;
  }
  if (doc.extension === "txt") {
    return (
      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl border border-border/40 bg-background/60 p-4 font-mono text-xs leading-relaxed text-foreground/90">
        {doc.content || `Plain text mock file — ${doc.name}`}
      </pre>
    );
  }
  if (doc.extension === "image") {
    return (
      <div className="grid h-72 place-items-center overflow-hidden rounded-xl border border-border/40 bg-gradient-to-br from-primary/10 via-background/40 to-primary/5">
        <div className="text-center">
          <Icon className={cn("mx-auto h-12 w-12", color)} />
          <div className="mt-2 text-sm font-medium">{doc.name}</div>
          <div className="text-xs text-muted-foreground">
            Mock image · {formatBytes(doc.size)}
          </div>
        </div>
      </div>
    );
  }
  if (doc.extension === "pdf") {
    return (
      <div className="overflow-hidden rounded-xl border border-border/40 bg-background/60">
        <div className="flex items-center justify-between border-b border-border/40 bg-card/60 px-4 py-2 text-xs">
          <span className="font-mono text-muted-foreground">PDF · {formatBytes(doc.size)}</span>
          <span className="text-muted-foreground">Page 1 of 1 (mock)</span>
        </div>
        <div className="aspect-[1/1.3] bg-white p-8 text-[#222]">
          <h3 className="text-lg font-bold">{doc.title}</h3>
          <p className="mt-1 text-xs uppercase tracking-wider text-neutral-600">{doc.category}</p>
          <p className="mt-3 text-xs leading-relaxed text-neutral-700">
            {doc.description || "No description provided."}
          </p>
          <p className="mt-4 text-[11px] leading-relaxed text-neutral-600">
            This is a frontend-only PDF placeholder. Real PDF rendering would be wired through a viewer
            library in a future iteration.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-2 text-[10px] text-neutral-500">
            <div>Owner: {doc.owner || "—"}</div>
            <div>Version: {doc.version}</div>
            <div>Status: {doc.status}</div>
          </div>
        </div>
      </div>
    );
  }
  if (doc.extension === "docx") {
    return (
      <div className="overflow-hidden rounded-xl border border-border/40 bg-white text-[#222]">
        <div className="flex items-center gap-2 border-b border-neutral-200 bg-[#2B579A] px-4 py-2 text-xs text-white">
          <Icon className="h-4 w-4" /> Microsoft Word · {doc.name}.docx
        </div>
        <div className="p-8 font-serif text-sm leading-relaxed">
          <h2 className="text-xl font-semibold">{doc.title}</h2>
          <p className="mt-2 text-xs text-neutral-500">{doc.category} · {doc.owner || "Unknown"}</p>
          <hr className="my-3 border-neutral-200" />
          <p className="text-sm">{doc.description}</p>
          <p className="mt-3 text-sm text-neutral-700">
            {doc.content || "Mock Word document. Add content in the editor."}
          </p>
        </div>
      </div>
    );
  }
  if (doc.extension === "xlsx") {
    return (
      <div className="overflow-hidden rounded-xl border border-border/40 bg-white text-[#222]">
        <div className="flex items-center gap-2 border-b border-neutral-200 bg-[#107C41] px-4 py-2 text-xs text-white">
          <Icon className="h-4 w-4" /> Microsoft Excel · {doc.name}.xlsx
        </div>
        <div className="overflow-x-auto p-4">
          <table className="min-w-full text-xs">
            <thead className="bg-neutral-100 text-neutral-700">
              <tr>
                {["A", "B", "C", "D"].map((h) => (
                  <th key={h} className="border border-neutral-200 px-3 py-1.5 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, r) => (
                <tr key={r} className="hover:bg-neutral-50">
                  {Array.from({ length: 4 }).map((_, c) => (
                    <td key={c} className="border border-neutral-200 px-3 py-1.5 font-mono text-neutral-600">
                      {r === 0 ? ["Item", "Owner", "Status", "Date"][c] : `Row ${r}-${c + 1}`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[10px] text-neutral-500">Mock spreadsheet preview.</p>
        </div>
      </div>
    );
  }
  if (doc.extension === "pptx") {
    return (
      <div className="overflow-hidden rounded-xl border border-border/40 bg-white text-[#222]">
        <div className="flex items-center gap-2 border-b border-neutral-200 bg-[#B7472A] px-4 py-2 text-xs text-white">
          <Icon className="h-4 w-4" /> PowerPoint · {doc.name}.pptx
        </div>
        <div className="aspect-video bg-gradient-to-br from-[#fff3eb] to-white p-10">
          <h2 className="text-2xl font-bold text-[#B7472A]">{doc.title}</h2>
          <p className="mt-2 text-sm text-neutral-700">{doc.description || "Mock slide deck."}</p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {["Overview", "Plan", "Outcome"].map((s) => (
              <div key={s} className="rounded-md border border-neutral-200 bg-white p-3 text-xs">
                <div className="font-semibold text-neutral-800">{s}</div>
                <div className="mt-1 text-neutral-500">Mock placeholder content.</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Unsupported / generic file
  return (
    <div className="grid h-64 place-items-center rounded-xl border border-dashed border-border bg-background/40">
      <div className="max-w-sm text-center">
        <Icon className={cn("mx-auto h-12 w-12", color)} />
        <div className="mt-3 text-sm font-medium">{doc.name}.{doc.extension}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Preview not available for this file type · {formatBytes(doc.size)}
        </div>
      </div>
    </div>
  );
}

// Tiny markdown renderer for prototype previews (headings, lists, bold, code)
function MarkdownPreview({ content }: { content: string }) {
  const lines = (content || "*Empty document*").split("\n");
  const blocks: { type: "h1" | "h2" | "h3" | "li" | "p" | "code"; text: string }[] = [];
  let inCode = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (line.trim().startsWith("```")) { inCode = !inCode; continue; }
    if (inCode) { blocks.push({ type: "code", text: line }); continue; }
    if (line.startsWith("### ")) blocks.push({ type: "h3", text: line.slice(4) });
    else if (line.startsWith("## ")) blocks.push({ type: "h2", text: line.slice(3) });
    else if (line.startsWith("# ")) blocks.push({ type: "h1", text: line.slice(2) });
    else if (line.startsWith("- ") || line.startsWith("* ")) blocks.push({ type: "li", text: line.slice(2) });
    else if (line.trim()) blocks.push({ type: "p", text: line });
  }
  const fmt = (t: string) =>
    t
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="rounded bg-muted/60 px-1 py-0.5 font-mono text-[11px]">$1</code>');
  return (
    <div className="max-h-[60vh] overflow-auto rounded-xl border border-border/40 bg-background/60 p-5 text-sm leading-relaxed">
      {blocks.map((b, i) => {
        if (b.type === "h1") return <h2 key={i} className="mb-2 mt-3 text-lg font-semibold">{b.text}</h2>;
        if (b.type === "h2") return <h3 key={i} className="mb-1.5 mt-3 text-base font-semibold">{b.text}</h3>;
        if (b.type === "h3") return <h4 key={i} className="mb-1 mt-2 text-sm font-semibold">{b.text}</h4>;
        if (b.type === "li") return <li key={i} className="ml-5 list-disc text-sm" dangerouslySetInnerHTML={{ __html: fmt(b.text) }} />;
        if (b.type === "code") return <pre key={i} className="my-1 rounded bg-muted/40 px-2 py-1 font-mono text-[11px]">{b.text}</pre>;
        return <p key={i} className="my-1 text-sm text-foreground/90" dangerouslySetInnerHTML={{ __html: fmt(b.text) }} />;
      })}
    </div>
  );
}
