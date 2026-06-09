import { FileText, FileSpreadsheet, FileType, Image as ImageIcon, FileCode, File as FileIcon, Presentation } from "lucide-react";
import type { DocType } from "@/lib/data/types";

export function fileIconFor(ext: DocType) {
  switch (ext) {
    case "pdf":
      return { Icon: FileType, color: "text-[#FF7C91]" };
    case "xlsx":
      return { Icon: FileSpreadsheet, color: "text-[#52D6A4]" };
    case "docx":
      return { Icon: FileText, color: "text-[#5B8CFF]" };
    case "pptx":
      return { Icon: Presentation, color: "text-[#FFC86B]" };
    case "md":
      return { Icon: FileCode, color: "text-[#5B8CFF]" };
    case "image":
      return { Icon: ImageIcon, color: "text-[#FFC86B]" };
    case "txt":
      return { Icon: FileText, color: "text-muted-foreground" };
    default:
      return { Icon: FileIcon, color: "text-muted-foreground" };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDate(iso);
}
