import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Sparkles, X as XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TicketPriority, TicketType } from "@/lib/service-desk/types";

export type TicketComposerCategory = {
  value: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type TicketComposerValues = {
  subject: string;
  description: string;
  category: string;
  type: TicketType;
  priority: TicketPriority;
  subcategory: string;
  tags: string[];
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  pending?: boolean;
  categories: TicketComposerCategory[];
  defaultType?: TicketType;
  showType?: boolean;
  showSubcategory?: boolean;
  showTags?: boolean;
  ticketTypes?: TicketType[];
  onSubmit: (values: TicketComposerValues) => void;
};

const PRIORITIES: { value: TicketPriority; label: string; tone: string; dot: string }[] = [
  { value: "low", label: "Low", tone: "text-muted-foreground", dot: "bg-muted-foreground/60" },
  { value: "normal", label: "Normal", tone: "text-sky-400", dot: "bg-sky-400" },
  { value: "high", label: "High", tone: "text-amber-400", dot: "bg-amber-400" },
  { value: "critical", label: "Critical", tone: "text-rose-400", dot: "bg-rose-400" },
];

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function TicketComposer({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pending,
  categories,
  defaultType = "incident",
  showType = true,
  showSubcategory = false,
  showTags = true,
  ticketTypes = ["request", "incident", "problem", "change"],
  onSubmit,
}: Props) {
  const [subject, setSubject] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState<string>(categories[0]?.value ?? "");
  const [type, setType] = useState<TicketType>(defaultType);
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [subcategory, setSubcategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setSubject("");
      setDesc("");
      setCategory(categories[0]?.value ?? "");
      setType(defaultType);
      setPriority("normal");
      setSubcategory("");
      setTags([]);
      setTagDraft("");
    }
  }, [open, categories, defaultType]);

  const subjectOk = subject.trim().length >= 4;
  const descOk = desc.trim().length >= 8;
  const ready = Boolean(category) && subjectOk && descOk;
  const progress = useMemo(() => {
    let n = 0;
    if (category) n++;
    if (subjectOk) n++;
    if (descOk) n++;
    return Math.round((n / 3) * 100);
  }, [category, subjectOk, descOk]);

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/,$/, "");
    if (!t) return;
    if (tags.includes(t)) return;
    if (tags.length >= 8) return;
    setTags([...tags, t]);
  };

  const handleTagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagDraft);
      setTagDraft("");
    } else if (e.key === "Backspace" && !tagDraft && tags.length) {
      setTags(tags.slice(0, -1));
    }
  };

  const submit = () => {
    if (!ready || pending) return;
    onSubmit({
      subject: subject.trim(),
      description: desc.trim(),
      category,
      type,
      priority,
      subcategory: subcategory.trim(),
      tags,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        {/* Header */}
        <SheetHeader className="space-y-3 border-b border-border/40 px-6 pb-5 pt-6 text-left">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-lg font-semibold tracking-tight">{title}</SheetTitle>
              <SheetDescription className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {description}
              </SheetDescription>
            </div>
          </div>
          {/* Progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>{ready ? "Ready to submit" : "Fill in the required fields"}</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <form
            id="ticket-composer-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-7"
          >
            {/* Category */}
            <section className="space-y-3">
              <SectionHeader index={1} label="Pick a category" hint="Helps route to the right team" />
              <div className="grid grid-cols-2 gap-2">
                {categories.map((c) => {
                  const Icon = c.icon;
                  const active = category === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className={cn(
                        "group relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all",
                        "hover:-translate-y-px hover:shadow-md hover:shadow-primary/5",
                        active
                          ? "border-primary/60 bg-primary/10 ring-1 ring-primary/40"
                          : "border-border/60 bg-background/40 hover:border-border",
                      )}
                      aria-pressed={active}
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                          active
                            ? "bg-primary/20 text-primary"
                            : "bg-muted/40 text-muted-foreground group-hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold leading-tight text-foreground">{c.label}</div>
                        <div className="text-[10px] leading-snug text-muted-foreground line-clamp-2">
                          {c.description}
                        </div>
                      </div>
                      {active && (
                        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Subject + Description */}
            <section className="space-y-4">
              <SectionHeader index={2} label="Describe the issue" hint="The more context, the faster the fix" />

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">
                    Subject <span className="text-destructive">*</span>
                  </Label>
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      subjectOk ? "text-emerald-400" : "text-muted-foreground",
                    )}
                  >
                    {subject.trim().length}/120
                  </span>
                </div>
                <Input
                  value={subject}
                  maxLength={120}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Laptop won't turn on after update"
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">
                    Description <span className="text-destructive">*</span>
                  </Label>
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      descOk ? "text-emerald-400" : "text-muted-foreground",
                    )}
                  >
                    {desc.trim().length} chars
                  </span>
                </div>
                <Textarea
                  rows={5}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="What happened? When did it start? Any error messages or impacted users?"
                  className="resize-none"
                />
                <p className="text-[10px] text-muted-foreground">
                  Tip: include steps to reproduce, error codes, or screenshots in the ticket after submitting.
                </p>
              </div>
            </section>

            {/* Details */}
            <section className="space-y-4">
              <SectionHeader index={3} label="Details" hint="Optional — defaults are fine" />

              <div className={cn("grid gap-3", showType ? "grid-cols-2" : "grid-cols-1")}>
                {showType && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Type</Label>
                    <Select value={type} onValueChange={(v) => setType(v as TicketType)}>
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ticketTypes.map((t) => (
                          <SelectItem key={t} value={t}>
                            {cap(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Priority</Label>
                  <div className="flex gap-1.5 rounded-lg border border-border/60 bg-background/40 p-1">
                    {PRIORITIES.map((p) => {
                      const active = priority === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setPriority(p.value)}
                          className={cn(
                            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all",
                            active
                              ? "bg-muted text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                          aria-pressed={active}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {showSubcategory && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Subcategory</Label>
                  <Input
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    placeholder="Optional — e.g. Outlook, VPN, External monitor"
                    className="h-10"
                  />
                </div>
              )}

              {showTags && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Tags</Label>
                  <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
                    {tags.map((t) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/15"
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() => setTags(tags.filter((x) => x !== t))}
                          className="rounded-sm hover:bg-primary/20"
                          aria-label={`Remove ${t}`}
                        >
                          <XIcon className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                    <input
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={handleTagKey}
                      onBlur={() => {
                        if (tagDraft) {
                          addTag(tagDraft);
                          setTagDraft("");
                        }
                      }}
                      placeholder={tags.length ? "" : "Type and press Enter…"}
                      className="flex-1 border-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
              )}
            </section>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border/40 bg-background/95 px-6 py-4 backdrop-blur">
          <div className="text-[11px] text-muted-foreground">
            {ready ? (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Check className="h-3 w-3" /> Ready to submit
              </span>
            ) : (
              <span>Subject ≥ 4 chars, description ≥ 8 chars</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="ticket-composer-form"
              disabled={!ready || pending}
              className="min-w-[140px]"
            >
              {pending ? "Submitting…" : submitLabel}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SectionHeader({ index, label, hint }: { index: number; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
        {index}
      </span>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{label}</h3>
      {hint && <span className="text-[10px] text-muted-foreground">· {hint}</span>}
    </div>
  );
}
