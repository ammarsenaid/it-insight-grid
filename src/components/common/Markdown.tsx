import { useMemo } from "react";
import { cn } from "@/lib/utils";

// Minimal, safe-ish markdown renderer for prototype use.
// Supports: headings, bold, italic, inline code, code blocks, links,
// unordered/ordered lists, task lists, blockquotes, horizontal rules.

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string) {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-white/[0.06] px-1 py-0.5 text-[12px]">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="text-primary underline-offset-2 hover:underline">$1</a>',
  );
  return out;
}

function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listKind: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listKind) {
      out.push(`</${listKind}>`);
      listKind = null;
    }
  };

  for (let raw of lines) {
    if (raw.startsWith("```")) {
      if (inCode) {
        out.push(
          `<pre class="my-2 overflow-x-auto rounded-lg border border-border/40 bg-background/60 p-3 text-[12px]"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`,
        );
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      continue;
    }
    const line = raw;
    if (/^\s*$/.test(line)) {
      closeList();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const lvl = h[1].length;
      const size = ["text-xl", "text-lg", "text-base", "text-sm", "text-sm", "text-sm"][lvl - 1];
      const slug = h[2]
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 80);
      out.push(`<h${lvl} id="${slug}" class="${size} mt-3 mb-1 scroll-mt-4 font-semibold text-foreground">${inline(h[2])}</h${lvl}>`);
      continue;
    }
    if (/^(\-{3,}|\*{3,})$/.test(line.trim())) {
      closeList();
      out.push('<hr class="my-3 border-border/40" />');
      continue;
    }
    const blockquote = /^>\s?(.*)$/.exec(line);
    if (blockquote) {
      closeList();
      out.push(
        `<blockquote class="border-l-2 border-primary/50 pl-3 italic text-muted-foreground">${inline(blockquote[1])}</blockquote>`,
      );
      continue;
    }
    const task = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    if (task) {
      if (listKind !== "ul") {
        closeList();
        out.push('<ul class="my-1 space-y-1 pl-1">');
        listKind = "ul";
      }
      const checked = task[1].toLowerCase() === "x";
      out.push(
        `<li class="flex items-start gap-2"><input type="checkbox" disabled ${checked ? "checked" : ""} class="mt-1 accent-primary" /><span class="${checked ? "text-muted-foreground line-through" : ""}">${inline(task[2])}</span></li>`,
      );
      continue;
    }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ul) {
      if (listKind !== "ul") {
        closeList();
        out.push('<ul class="my-1 list-disc space-y-0.5 pl-5">');
        listKind = "ul";
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      if (listKind !== "ol") {
        closeList();
        out.push('<ol class="my-1 list-decimal space-y-0.5 pl-5">');
        listKind = "ol";
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p class="my-1 leading-relaxed">${inline(line)}</p>`);
  }
  closeList();
  if (inCode && codeBuf.length) {
    out.push(
      `<pre class="my-2 overflow-x-auto rounded-lg border border-border/40 bg-background/60 p-3 text-[12px]"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`,
    );
  }
  return out.join("\n");
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(source || ""), [source]);
  return (
    <div
      className={cn("text-sm text-foreground/90", className)}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
