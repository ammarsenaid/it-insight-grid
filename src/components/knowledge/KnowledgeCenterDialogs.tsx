/**
 * Knowledge Center — write & permission dialogs (frontend only).
 *
 * These dialogs render the finished UX for write/manage flows. Mutating
 * actions (Create / Save / Publish / Apply) are disabled until the matching
 * server-side authorization is available in this environment.
 */


import { useState, type ReactNode } from "react";
import {
  Book,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  Folder,
  Globe2,
  Info,
  Lock,
  Pencil,
  Plus,
  Settings2,
  Shield,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Markdown } from "@/components/common/Markdown";
import { cn } from "@/lib/utils";
import type {
  KbArticle,
  KbCategory,
  KbSpace,
} from "@/lib/knowledge/backend-types";

// ---------------------------------------------------------------------------
// Visibility option model (local; mirrors workspace VISIBILITY for the picker)
// ---------------------------------------------------------------------------

export type VisKey =
  | "all_employees"
  | "it_only"
  | "specific_teams"
  | "assigned"
  | "confidential";

interface VisOption {
  key: VisKey;
  label: string;
  description: string;
  icon: LucideIcon;
  ring: string;
  tone: string;
  dot: string;
}

const VIS_OPTIONS: VisOption[] = [
  {
    key: "all_employees",
    label: "All Employees",
    description: "Every authenticated employee can read.",
    icon: Globe2,
    ring: "ring-emerald-400/40",
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    dot: "bg-emerald-400",
  },
  {
    key: "it_only",
    label: "IT Team Only",
    description: "Restricted to the IT department.",
    icon: Shield,
    ring: "ring-sky-400/40",
    tone: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    dot: "bg-sky-400",
  },
  {
    key: "specific_teams",
    label: "Specific Teams",
    description: "Only members of the selected teams.",
    icon: Users,
    ring: "ring-violet-400/40",
    tone: "border-violet-500/30 bg-violet-500/10 text-violet-300",
    dot: "bg-violet-400",
  },
  {
    key: "assigned",
    label: "Private / Assigned",
    description: "Only explicitly assigned individuals.",
    icon: Lock,
    ring: "ring-amber-400/40",
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    dot: "bg-amber-400",
  },
  {
    key: "confidential",
    label: "Confidential",
    description: "Senior staff only; full audit trail required.",
    icon: Lock,
    ring: "ring-rose-400/40",
    tone: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    dot: "bg-rose-400",
  },
];

function visFromString(v: string | null | undefined): VisKey {
  const s = (v ?? "").toLowerCase();
  if (s.includes("confidential")) return "confidential";
  if (s.includes("assigned") || s.includes("private")) return "assigned";
  if (s.includes("team") && s.includes("specific")) return "specific_teams";
  if (s.includes("it")) return "it_only";
  return "all_employees";
}

// ---------------------------------------------------------------------------
// Shared shell pieces
// ---------------------------------------------------------------------------

function PendingBanner() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-card/40 px-3 py-2.5 text-[12px] leading-snug text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Creation, editing and permission changes are not available in this
        environment. You can review the form below.
      </span>
    </div>
  );
}

function PendingSubmitButton({ label }: { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex">
          <Button
            type="button"
            disabled
            aria-disabled="true"
            className="pointer-events-none opacity-60"
          >
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-xs">
        Not available in this environment.
      </TooltipContent>
    </Tooltip>
  );
}

function VisibilityPicker({
  value,
  onChange,
  compact = false,
}: {
  value: VisKey;
  onChange: (v: VisKey) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {VIS_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={cn(
              "group flex items-start gap-2.5 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 text-left transition",
              "hover:border-primary/40 hover:bg-background/60",
              active && cn("border-primary/60 bg-background/80 ring-2", opt.ring),
            )}
            aria-pressed={active}
          >
            <span
              className={cn(
                "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border",
                opt.tone,
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">
                {opt.label}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-muted-foreground">
                {opt.description}
              </span>
            </span>
            {active && (
              <CheckCircle2 className="ml-auto mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-rose-400">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inheritance preview (Book → Chapter → Page)
// ---------------------------------------------------------------------------

export function InheritancePreview({
  bookName,
  bookVis,
  chapterName,
  chapterVis,
  pageName,
  pageVis,
  className,
}: {
  bookName: string;
  bookVis: VisKey;
  chapterName?: string | null;
  chapterVis?: VisKey | null;
  pageName?: string | null;
  pageVis?: VisKey | null;
  className?: string;
}) {
  const steps: { kind: string; name: string; vis: VisKey; icon: LucideIcon }[] =
    [
      { kind: "Book", name: bookName, vis: bookVis, icon: Book },
    ];
  if (chapterName) {
    steps.push({
      kind: "Chapter",
      name: chapterName,
      vis: chapterVis ?? bookVis,
      icon: Folder,
    });
  }
  if (pageName) {
    steps.push({
      kind: "Page",
      name: pageName,
      vis: pageVis ?? chapterVis ?? bookVis,
      icon: FileText,
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-background/40 p-3",
        className,
      )}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Access inheritance
        </p>
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => {
          const opt = VIS_OPTIONS.find((o) => o.key === s.vis) ?? VIS_OPTIONS[0];
          const Icon = s.icon;
          const parent = i > 0 ? steps[i - 1] : null;
          const overrides = parent && parent.vis !== s.vis;
          return (
            <li
              key={s.kind}
              className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-2.5 py-1.5"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border/40 bg-background/70 text-muted-foreground">
                <Icon className="h-3 w-3" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.kind}
                </span>
                <span className="block truncate text-xs font-medium">
                  {s.name}
                </span>
              </span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  opt.tone,
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", opt.dot)} />
                {opt.label}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-sm border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  overrides
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                    : "border-border/40 bg-background/60 text-muted-foreground",
                )}
              >
                {overrides ? "Overrides" : i === 0 ? "Source" : "Inherits"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trigger button used in the workspace
// ---------------------------------------------------------------------------

function TriggerButton({
  label,
  icon,
  variant = "default",
  size = "sm",
  onClick,
}: {
  label: string;
  icon?: ReactNode;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "xs";
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      onClick={onClick}
      className={cn(size === "xs" && "h-7 px-2 text-xs")}
    >
      {icon}
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// New Book dialog
// ---------------------------------------------------------------------------

export function NewBookDialog({
  teams,
  defaultTeamId,
}: {
  teams: { id: string; name: string }[];
  defaultTeamId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [team, setTeam] = useState<string>(defaultTeamId ?? teams[0]?.id ?? "");
  const [vis, setVis] = useState<VisKey>("all_employees");
  const [owner, setOwner] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TriggerButton
        label="New Book"
        icon={<Plus className="mr-1.5 h-3.5 w-3.5" />}
        onClick={() => setOpen(true)}
      />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Book className="h-4 w-4 text-primary" />
            New Book
          </DialogTitle>
          <DialogDescription>
            Create a new top-level book inside a department. Books group
            chapters and pages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <PendingBanner />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Book name" required htmlFor="nb-name">
              <Input
                id="nb-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug)
                    setSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, ""),
                    );
                }}
                placeholder="e.g. IT Runbooks"
              />
            </Field>
            <Field label="Slug" htmlFor="nb-slug" hint="Used in the book URL.">
              <Input
                id="nb-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="it-runbooks"
                className="font-mono"
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="nb-desc">
            <Textarea
              id="nb-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of what this book covers."
              rows={3}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department" required>
              <Select value={team} onValueChange={setTeam}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Owner / team lead" htmlFor="nb-owner" hint="Optional.">
              <Input
                id="nb-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="e.g. Maya Patel"
              />
            </Field>
          </div>
          <Field label="Default visibility">
            <VisibilityPicker value={vis} onChange={setVis} />
          </Field>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close preview
          </Button>
          <PendingSubmitButton label="Create book" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// New Chapter dialog
// ---------------------------------------------------------------------------

export function NewChapterDialog({
  book,
  bookVis,
}: {
  book: KbSpace;
  bookVis: VisKey;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [order, setOrder] = useState("0");
  const [inherit, setInherit] = useState(true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TriggerButton
        label="New Chapter"
        variant="outline"
        size="xs"
        icon={<Plus className="mr-1 h-3 w-3" />}
        onClick={() => setOpen(true)}
      />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-primary" />
            New Chapter
          </DialogTitle>
          <DialogDescription>
            Chapters group related pages inside <span className="font-medium">{book.name}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <PendingBanner />
          <Field label="Chapter title" required htmlFor="nc-title">
            <Input
              id="nc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Onboarding"
            />
          </Field>
          <Field label="Parent book">
            <Input value={book.name ?? "Untitled book"} disabled />
          </Field>
          <Field label="Description" htmlFor="nc-desc">
            <Textarea
              id="nc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What does this chapter cover?"
            />
          </Field>
          <Field label="Position / sort order" htmlFor="nc-order" hint="Lower numbers appear first.">
            <Input
              id="nc-order"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              inputMode="numeric"
              className="font-mono"
            />
          </Field>
          <label className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={inherit}
              onChange={(e) => setInherit(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              <span className="block font-medium">Inherit permissions from book</span>
              <span className="block text-[11px] text-muted-foreground">
                When off, you can set per-chapter visibility.
              </span>
            </span>
          </label>
          <InheritancePreview
            bookName={book.name ?? "Untitled book"}
            bookVis={bookVis}
            chapterName={title || "New chapter"}
            chapterVis={inherit ? bookVis : "specific_teams"}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close preview
          </Button>
          <PendingSubmitButton label="Create chapter" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// New Page dialog
// ---------------------------------------------------------------------------

export function NewPageDialog({
  book,
  bookVis,
  chapters,
  defaultChapterId,
  size = "xs",
}: {
  book: KbSpace;
  bookVis: VisKey;
  chapters: KbCategory[];
  defaultChapterId?: string | null;
  size?: "sm" | "xs";
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [chapterId, setChapterId] = useState<string>(
    defaultChapterId ?? chapters[0]?.id ?? "__none",
  );
  const [vis, setVis] = useState<VisKey>(bookVis);
  const [draft, setDraft] = useState(true);

  const chapterName =
    chapterId === "__none"
      ? null
      : chapters.find((c) => c.id === chapterId)?.name ?? null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TriggerButton
        label="New Page"
        size={size}
        icon={<Plus className={cn("mr-1", size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5")} />}
        onClick={() => setOpen(true)}
      />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            New Page
          </DialogTitle>
          <DialogDescription>
            Create a new page inside <span className="font-medium">{book.name}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <PendingBanner />
          <Field label="Page title" required htmlFor="np-title">
            <Input
              id="np-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Reset a user's MFA device"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Parent book">
              <Input value={book.name ?? "Untitled book"} disabled />
            </Field>
            <Field label="Parent chapter">
              <Select value={chapterId} onValueChange={setChapterId}>
                <SelectTrigger>
                  <SelectValue placeholder="No chapter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No chapter (loose page)</SelectItem>
                  {chapters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name ?? "Untitled chapter"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Summary" htmlFor="np-summary" hint="One or two sentences shown in lists and search results.">
            <Textarea
              id="np-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder="Short summary of the page."
            />
          </Field>
          <Field label="Visibility">
            <VisibilityPicker value={vis} onChange={setVis} />
          </Field>
          <label className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={draft}
              onChange={(e) => setDraft(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span>
              <span className="block font-medium">Save as draft</span>
              <span className="block text-[11px] text-muted-foreground">
                Drafts are only visible to editors until published.
              </span>
            </span>
          </label>
          <InheritancePreview
            bookName={book.name ?? "Untitled book"}
            bookVis={bookVis}
            chapterName={chapterName}
            chapterVis={bookVis}
            pageName={title || "New page"}
            pageVis={vis}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close preview
          </Button>
          <PendingSubmitButton label={draft ? "Save draft" : "Create page"} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit Page dialog
// ---------------------------------------------------------------------------

export function EditPageDialog({
  article,
  bookName,
  chapterName,
  size = "xs",
}: {
  article: KbArticle;
  bookName: string;
  chapterName?: string | null;
  size?: "sm" | "xs";
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(article.title ?? "");
  const [summary, setSummary] = useState(article.excerpt ?? "");
  const [content, setContent] = useState(article.content_markdown ?? "");
  const [vis, setVis] = useState<VisKey>(visFromString(article.visibility));
  const [status, setStatus] = useState<string>(article.status ?? "draft");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TriggerButton
        label="Edit page"
        variant="outline"
        size={size}
        icon={<Pencil className={cn("mr-1", size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5")} />}
        onClick={() => setOpen(true)}
      />
      <DialogContent className="flex h-[92dvh] w-[96vw] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/50 px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-primary" />
            Edit page
          </DialogTitle>
          <DialogDescription className="truncate text-xs">
            {bookName}
            {chapterName ? ` › ${chapterName}` : ""} › {title || "Untitled"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <PendingBanner />
          <Field label="Title" required htmlFor="ep-title">
            <Input
              id="ep-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base font-semibold"
            />
          </Field>
          <Field label="Summary" htmlFor="ep-summary">
            <Textarea
              id="ep-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
            />
          </Field>

          <Tabs defaultValue="write" className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:w-[260px]">
              <TabsTrigger value="write" className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Write
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                Preview
              </TabsTrigger>
            </TabsList>
            <TabsContent value="write" className="mt-3">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={16}
                placeholder="# Page heading&#10;&#10;Write Markdown here."
                className="min-h-[280px] resize-y font-mono text-sm leading-relaxed"
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Markdown supported. Live preview in the next tab.
              </p>
            </TabsContent>
            <TabsContent value="preview" className="mt-3">
              <div className="min-h-[280px] rounded-lg border border-border/50 bg-background/40 p-4">
                {content.trim() ? (
                  <div className="prose-knowledge max-w-none">
                    <Markdown source={content} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nothing to preview yet — start writing in the Write tab.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="in_review">In review</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Visibility">
              <Select value={vis} onValueChange={(v) => setVis(v as VisKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIS_OPTIONS.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/50 px-5 py-3 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close preview
          </Button>
          <PendingSubmitButton label="Save draft" />
          <PendingSubmitButton label="Publish" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Manage Permissions dialog
// ---------------------------------------------------------------------------

export function ManagePermissionsDialog({
  scope,
  name,
  bookName,
  bookVis,
  chapterName,
  chapterVis,
  currentVis,
  size = "xs",
}: {
  scope: "book" | "chapter" | "page";
  name: string;
  bookName: string;
  bookVis: VisKey;
  chapterName?: string | null;
  chapterVis?: VisKey | null;
  currentVis: VisKey;
  size?: "sm" | "xs";
}) {
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState(
    scope === "book" ? true : currentVis !== (chapterVis ?? bookVis),
  );
  const [vis, setVis] = useState<VisKey>(currentVis);

  const effective: VisKey = override ? vis : chapterVis ?? bookVis;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TriggerButton
        label="Manage access"
        variant="outline"
        size={size}
        icon={<Settings2 className={cn("mr-1", size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5")} />}
        onClick={() => setOpen(true)}
      />
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Manage access
          </DialogTitle>
          <DialogDescription className="truncate">
            {scope === "book" ? "Book" : scope === "chapter" ? "Chapter" : "Page"}:{" "}
            <span className="font-medium">{name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <PendingBanner />

          {scope !== "book" && (
            <label className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block font-medium">
                  Override inherited permissions
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  When off, this {scope} uses the rules of its parent{" "}
                  {scope === "chapter" ? "book" : "chapter or book"}.
                </span>
              </span>
            </label>
          )}

          <Field label="Visibility">
            <VisibilityPicker
              value={override ? vis : chapterVis ?? bookVis}
              onChange={setVis}
            />
            {!override && (
              <p className="text-[11px] text-amber-200/90">
                Inherits — toggle override above to change.
              </p>
            )}
          </Field>

          {(effective === "specific_teams" || effective === "assigned") && (
            <div className="rounded-lg border border-border/50 bg-background/40 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Allowed {effective === "specific_teams" ? "teams" : "people"}
              </p>
              <div className="rounded-md border border-dashed border-border/50 bg-background/30 px-3 py-4 text-center text-xs text-muted-foreground">
                <Users className="mx-auto mb-1.5 h-4 w-4" aria-hidden />
                Member selection is not available in this environment.
              </div>
            </div>
          )}

          <InheritancePreview
            bookName={bookName}
            bookVis={bookVis}
            chapterName={chapterName ?? undefined}
            chapterVis={chapterVis ?? undefined}
            pageName={scope === "page" ? name : null}
            pageVis={scope === "page" ? effective : null}
          />

          <p className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 text-[11px] leading-snug text-muted-foreground">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            Final access is enforced server-side using the rules shown above.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close preview
          </Button>
          <PendingSubmitButton label="Apply permissions" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helper export for callsites
// ---------------------------------------------------------------------------

export { visFromString };
