import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  Flag,
  Flame,
  HelpCircle,
  Laptop,
  AppWindow,
  KeyRound,
  Wifi,
  Printer as PrinterIcon,
  Mail,
  ShieldCheck,
  Lightbulb,
  ListChecks,
  Save,
  Search,
  Sparkles,
  Tag,
  UploadCloud,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  FormGrid,
  FormField,
  FormSection,
} from "@/components/common/FormGrid";
import { PageContainer } from "@/components/common/PageContainer";

import { useAuth } from "@/lib/auth/AuthProvider";
import { createTicket } from "@/lib/service-desk/tickets";
import type { TicketPriority, TicketType } from "@/lib/service-desk/types";

export type WizardMode = "ticket" | "request";

const CATEGORIES = [
  { value: "Hardware", label: "Hardware", icon: Laptop, services: ["Laptop / Desktop", "Monitor", "Peripherals", "Mobile device"] },
  { value: "Software", label: "Software", icon: AppWindow, services: ["Install application", "Update / Upgrade", "License request", "Bug or crash"] },
  { value: "Account & Access", label: "Access / Account", icon: KeyRound, services: ["Password reset", "MFA reset", "New account", "Permissions / role"] },
  { value: "Network", label: "Network", icon: Wifi, services: ["Wi-Fi issue", "VPN access", "Internet outage", "Cabling"] },
  { value: "Printer", label: "Printer", icon: PrinterIcon, services: ["Printer not working", "Toner / paper", "Add new printer", "Scanning issue"] },
  { value: "Email", label: "Email", icon: Mail, services: ["Mailbox issue", "Calendar", "Delivery / spam", "Shared mailbox"] },
  { value: "Security", label: "Security", icon: ShieldCheck, services: ["Phishing report", "Suspicious activity", "Lost device", "Data request"] },
  { value: "Other", label: "Other", icon: HelpCircle, services: ["General question", "Feedback", "Other"] },
] as const;

const PRIORITIES: { value: TicketPriority; label: string; description: string; dot: string }[] = [
  { value: "low", label: "Low", description: "Minor issue, no blocker", dot: "bg-muted-foreground/60" },
  { value: "normal", label: "Medium", description: "Affects me, has workaround", dot: "bg-sky-400" },
  { value: "high", label: "High", description: "Blocks my work", dot: "bg-amber-400" },
  { value: "critical", label: "Urgent", description: "Multiple users / outage", dot: "bg-rose-400" },
];

const ETA: Record<TicketPriority, string> = {
  low: "1 – 2 business days",
  normal: "2 – 4 business hours",
  high: "Within 1 hour",
  critical: "Within 15 minutes",
};

const POPULAR: { label: string; category: string }[] = [
  { label: "Laptop performance issue", category: "Hardware" },
  { label: "Request new hardware", category: "Hardware" },
  { label: "Software installation", category: "Software" },
  { label: "Email not syncing", category: "Email" },
  { label: "VPN connection issue", category: "Network" },
];

const TIPS = [
  "Search the knowledge base for quick answers",
  "Provide as much detail as possible",
  "Include screenshots if applicable",
  "Double-check attachments before submitting",
];

const STEPS = ["Request type", "Details", "Review"] as const;

type Props = {
  mode: WizardMode;
  backTo: "/tickets" | "/my-requests";
  homeTo?: string;
};

export function TicketWizard({ mode, backTo, homeTo = "/" }: Props) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user?.id ?? "";

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [done, setDone] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [type, setType] = useState<TicketType>(mode === "ticket" ? "incident" : "request");
  const [device, setDevice] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [createdNumber, setCreatedNumber] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const activeCategory = useMemo(
    () => CATEGORIES.find((c) => c.value === category),
    [category],
  );

  const titleOk = title.trim().length >= 4;
  const descOk = description.trim().length >= 8;
  const subcatOk = Boolean(subcategory);
  const step0Ok = Boolean(category);
  const step1Ok = step0Ok && titleOk && descOk && subcatOk;

  const isTicket = mode === "ticket";
  const labels = isTicket
    ? { page: "Create Ticket", intro: "Capture the issue, route it to the right team, and start the resolution clock.", crumb: "New Ticket", submit: "Create ticket", summary: "Ticket summary", successTitle: "Ticket created" }
    : { page: "Create Request", intro: "Tell us what you need help with and we'll get it to the right team.", crumb: "New Request", submit: "Submit request", summary: "Request summary", successTitle: "Request submitted" };

  const mutation = useMutation({
    mutationFn: async () =>
      createTicket(userId, {
        subject: title.trim(),
        description: description.trim(),
        type,
        category,
        subcategory: subcategory || null,
        priority,
        tags: device ? [device.toLowerCase().slice(0, 24)] : [],
      }),
    onSuccess: (t) => {
      setCreatedNumber(t.ticketNumber);
      setCreatedId(t.id);
      setDone(true);
      toast.success(`${isTicket ? "Ticket" : "Request"} ${t.ticketNumber} created`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Submission failed"),
  });

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= 6) break;
      if (f.size > 25 * 1024 * 1024) { toast.error(`${f.name} exceeds 25 MB`); continue; }
      next.push(f);
    }
    setFiles(next);
  };
  const removeFile = (i: number) => setFiles(files.filter((_, idx) => idx !== i));

  const pickPopular = (label: string, cat: string) => {
    setCategory(cat);
    setSubcategory("");
    setTitle(label);
  };

  const goNext = () => {
    if (step === 0 && !step0Ok) return;
    if (step === 1 && !step1Ok) return;
    setStep((s) => (s === 2 ? 2 : ((s + 1) as 0 | 1 | 2)));
  };
  const goBack = () => setStep((s) => (s === 0 ? 0 : ((s - 1) as 0 | 1 | 2)));

  if (done) {
    return (
      <PageContainer className="pb-12 pt-6">
        <DoneCard
          ticketNumber={createdNumber}
          ticketId={createdId}
          isTicket={isTicket}
          title={labels.successTitle}
          backTo={backTo}
          onAnother={() => {
            setDone(false); setStep(0); setCategory(""); setSubcategory(""); setTitle("");
            setDescription(""); setDevice(""); setFiles([]); setPriority("normal");
            setCreatedNumber(null); setCreatedId(null);
          }}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="pb-28 pt-6">
      {/* Breadcrumb */}
      <nav className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Link to={homeTo} className="truncate hover:text-foreground">Home</Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <Link to={backTo} className="truncate hover:text-foreground">
          {isTicket ? "Tickets" : "My Requests"}
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="truncate text-foreground">{labels.crumb}</span>
      </nav>

      {/* Header */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent text-primary ring-1 ring-primary/30">
            <FilePlus2 className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight sm:text-2xl">{labels.page}</h1>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:text-sm">{labels.intro}</p>
          </div>
        </div>
        <div className="col-span-2 min-w-[180px] shrink-0 sm:col-span-1">
          <StepBar step={step} />
        </div>
      </header>

      {/* Body: two columns on lg */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main */}
        <div className="min-w-0 space-y-6">
          {/* Mobile collapsible summary */}
          <details className="group rounded-2xl border border-border/60 bg-card/60 p-3 lg:hidden">
            <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5" /> {labels.summary}
              </span>
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <div className="mt-3">
              <SummaryBody category={category} subcategory={subcategory} priority={priority} step={step} />
            </div>
          </details>

          {step === 0 && (
            <StepType
              category={category}
              setCategory={(v) => { setCategory(v); setSubcategory(""); }}
              onPopular={pickPopular}
            />
          )}

          {step === 1 && activeCategory && (
            <StepDetails
              activeCategory={activeCategory}
              subcategory={subcategory}
              setSubcategory={setSubcategory}
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              priority={priority}
              setPriority={setPriority}
              device={device}
              setDevice={setDevice}
              files={files}
              onPickFiles={onPickFiles}
              removeFile={removeFile}
              isTicket={isTicket}
              type={type}
              setType={setType}
              titleOk={titleOk}
              descOk={descOk}
              subcatOk={subcatOk}
            />
          )}

          {step === 2 && (
            <StepReview
              category={category}
              subcategory={subcategory}
              title={title}
              description={description}
              priority={priority}
              device={device}
              files={files}
              type={type}
              isTicket={isTicket}
            />
          )}
        </div>

        {/* Sidebar */}
        <aside className="hidden min-w-0 lg:block">
          <div className="sticky top-20 space-y-4">
            <SummaryCard
              title={labels.summary}
              step={step}
              category={category}
              subcategory={subcategory}
              priority={priority}
            />
            <TipsCard />
          </div>
        </aside>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-4 z-20 mt-2">
        <div className="grid grid-cols-[auto_auto] items-center gap-2 rounded-2xl border border-border/60 bg-card/90 px-3 py-2.5 shadow-lg backdrop-blur sm:flex sm:flex-wrap sm:justify-between sm:gap-3 sm:px-4 sm:py-3">
          {/* Left cluster */}
          <div className="flex min-w-0 items-center gap-2">
            {step === 0 ? (
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: backTo })}>
                <X className="mr-1.5 h-4 w-4" /> Cancel
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={goBack}>
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
              </Button>
            )}
            <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
              <FooterHint step={step} step0Ok={step0Ok} step1Ok={step1Ok} />
            </span>
          </div>

          {/* Right cluster */}
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.success("Draft saved locally")}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" />
              <span className="hidden sm:inline">Save draft</span>
              <span className="sm:hidden">Draft</span>
            </Button>
            {step < 2 ? (
              <Button
                size="sm"
                onClick={goNext}
                disabled={step === 0 ? !step0Ok : !step1Ok}
                className="gap-1.5"
              >
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => { if (!userId) return toast.error("You must be signed in"); mutation.mutate(); }}
                disabled={mutation.isPending}
                className="gap-1.5"
              >
                {mutation.isPending ? "Submitting…" : labels.submit}
                {!mutation.isPending && <Check className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

/* -------------------- Step bar -------------------- */
function StepBar({ step }: { step: 0 | 1 | 2 }) {
  return (
    <div>
      <div className="text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </div>
      <div className="mt-2 flex gap-1.5">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= step ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function FooterHint({ step, step0Ok, step1Ok }: { step: 0 | 1 | 2; step0Ok: boolean; step1Ok: boolean }) {
  if (step === 0) {
    return step0Ok
      ? <span className="inline-flex items-center gap-1.5 text-emerald-400"><Check className="h-3 w-3" /> Category selected</span>
      : <>Select a category to continue</>;
  }
  if (step === 1) {
    return step1Ok
      ? <span className="inline-flex items-center gap-1.5 text-emerald-400"><Check className="h-3 w-3" /> Ready for review</span>
      : <>Add a service, title (≥4 chars), and description (≥8 chars)</>;
  }
  return <>Review the summary, then submit when ready</>;
}

/* -------------------- Step 1 — Request type -------------------- */
function StepType({
  category,
  setCategory,
  onPopular,
}: {
  category: string;
  setCategory: (v: string) => void;
  onPopular: (label: string, cat: string) => void;
}) {
  const active = CATEGORIES.find((c) => c.value === category);
  return (
    <div className="space-y-6">
      <SectionCard
        title="Choose a request type"
        description="Pick the category that best matches what you need help with."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const isActive = category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                aria-pressed={isActive}
                className={cn(
                  "group relative flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center transition-all",
                  "hover:-translate-y-0.5 hover:border-border hover:shadow-md hover:shadow-primary/5",
                  isActive
                    ? "border-primary/60 bg-primary/10 ring-1 ring-primary/40"
                    : "border-border/60 bg-background/40",
                )}
              >
                <Icon className={cn("h-6 w-6 shrink-0 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                <span className={cn("text-xs font-medium leading-tight", isActive ? "text-foreground" : "text-muted-foreground")}>
                  {c.label}
                </span>
                {isActive && (
                  <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Popular request templates"
        description="Start from a common request — you can tweak the details on the next step."
        icon={<Flame className="h-4 w-4 text-orange-400" />}
      >
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {POPULAR.map((p) => (
            <li key={p.label}>
              <button
                type="button"
                onClick={() => onPopular(p.label, p.category)}
                className="group flex w-full items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-left text-sm hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Badge variant="secondary" className="h-5 shrink-0 rounded-md bg-muted/60 px-1.5 text-[10px] font-normal">
                    {p.category}
                  </Badge>
                  <span className="truncate">{p.label}</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Selected category">
        {active ? (
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
              <active.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{active.label}</div>
              <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                Services: {active.services.join(", ")}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/30 p-6 text-center text-xs text-muted-foreground">
            No category selected yet. Pick one above to continue.
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* -------------------- Step 2 — Details -------------------- */
function StepDetails(props: {
  activeCategory: (typeof CATEGORIES)[number];
  subcategory: string; setSubcategory: (v: string) => void;
  title: string; setTitle: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  priority: TicketPriority; setPriority: (v: TicketPriority) => void;
  device: string; setDevice: (v: string) => void;
  files: File[]; onPickFiles: (l: FileList | null) => void; removeFile: (i: number) => void;
  isTicket: boolean; type: TicketType; setType: (v: TicketType) => void;
  titleOk: boolean; descOk: boolean; subcatOk: boolean;
}) {
  const {
    activeCategory, subcategory, setSubcategory, title, setTitle, description, setDescription,
    priority, setPriority, device, setDevice, files, onPickFiles, removeFile,
    isTicket, type, setType, titleOk, descOk, subcatOk,
  } = props;

  const titleError = title.length > 0 && !titleOk ? "Use at least 4 characters." : undefined;
  const descError = description.length > 0 && !descOk ? "Use at least 8 characters." : undefined;
  const subcatError = !subcatOk ? "Select the service that best fits your request." : undefined;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Request details"
        description={`Describe your ${isTicket ? "issue" : "request"} so the right team can act on it.`}
      >
        <div className="space-y-6">
          <FormSection title="What and where" description="A clear title and the affected service.">
            <FormGrid>
              <FormField
                label="Request title" required full
                hint='Keep it short and specific (e.g., "Laptop not turning on").'
                error={titleError}
              >
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Briefly describe your request"
                  maxLength={100}
                  className="h-10"
                />
              </FormField>
              <FormField label="Service / subtype" required error={subcatError}>
                <Select value={subcategory} onValueChange={setSubcategory}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Select a service" /></SelectTrigger>
                  <SelectContent>
                    {activeCategory.services.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              {isTicket && (
                <FormField label="Ticket type" hint="Defaults to incident.">
                  <Select value={type} onValueChange={(v) => setType(v as TicketType)}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["request", "incident", "problem", "change"] as TicketType[]).map((t) => (
                        <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
              <FormField
                label="Description" required full
                hint="The more details you provide, the faster we can help."
                error={descError}
              >
                <Textarea
                  rows={6}
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide more details about the issue or request…"
                  className="resize-y"
                />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Priority and urgency" description="Pick the option that matches the impact.">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PRIORITIES.map((p) => {
                const isActive = priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                      isActive
                        ? "border-primary/60 bg-primary/10 ring-1 ring-primary/40"
                        : "border-border/60 bg-background/40 hover:border-border",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", p.dot)} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{p.label}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{p.description}</span>
                      </span>
                    </span>
                    {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          </FormSection>

          <FormSection title="Affected device or location" description="Optional — helps us route faster.">
            <FormGrid columns={1}>
              <FormField label="Device or location">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={device}
                    onChange={(e) => setDevice(e.target.value)}
                    placeholder="e.g., MacBook Pro · HQ floor 3 · Conference room A"
                    className="h-10 pl-9"
                  />
                </div>
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Attachments" description="Optional — add up to 6 files, 25 MB each.">
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 bg-background/40 px-4 py-7 text-center transition-colors",
                "hover:border-primary/50 hover:bg-primary/5",
              )}
            >
              <input
                type="file"
                multiple
                className="sr-only"
                accept=".jpg,.jpeg,.png,.pdf,.docx,.txt,.zip"
                onChange={(e) => onPickFiles(e.target.files)}
              />
              <UploadCloud className="h-6 w-6 text-primary" />
              <div className="text-sm">
                <span className="font-medium text-foreground">Drop files here, </span>
                <span className="font-medium text-primary">or browse</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                JPG, PNG, PDF, DOCX, TXT, ZIP — 25 MB per file
              </p>
            </label>
            {files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {files.map((f, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-foreground">{f.name}</span>
                      <span className="ml-2 text-muted-foreground">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </FormSection>
        </div>
      </SectionCard>
    </div>
  );
}

/* -------------------- Step 3 — Review -------------------- */
function StepReview(props: {
  category: string; subcategory: string; title: string; description: string;
  priority: TicketPriority; device: string; files: File[]; type: TicketType; isTicket: boolean;
}) {
  const p = PRIORITIES.find((x) => x.value === props.priority);
  const cat = CATEGORIES.find((c) => c.value === props.category);
  const CatIcon = cat?.icon ?? HelpCircle;
  return (
    <div className="space-y-6">
      <SectionCard
        title="Review & submit"
        description="Confirm everything looks right, then submit."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ReviewTile label="Category" icon={<CatIcon className="h-4 w-4" />} value={props.category || "—"} />
          <ReviewTile label="Service / subtype" icon={<ListChecks className="h-4 w-4" />} value={props.subcategory || "—"} />
          <ReviewTile
            label="Priority"
            icon={<Flag className="h-4 w-4" />}
            value={
              <span className="inline-flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", p?.dot)} />
                <span>{p?.label}</span>
              </span>
            }
          />
          {props.isTicket && (
            <ReviewTile label="Type" icon={<Tag className="h-4 w-4" />} value={props.type} />
          )}
          <ReviewTile label="Affected device / location" icon={<Search className="h-4 w-4" />} value={props.device || "—"} />
          <ReviewTile label="Attachments" icon={<UploadCloud className="h-4 w-4" />} value={props.files.length ? `${props.files.length} file${props.files.length === 1 ? "" : "s"}` : "None"} />
        </div>

        <div className="mt-5 space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Request title</div>
          <p className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm font-medium">
            {props.title || "—"}
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Description</div>
          <p className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-background/40 p-3 text-sm leading-relaxed">
            {props.description || "—"}
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Estimated response"
        description="Target response based on the priority you selected."
        icon={<Sparkles className="h-4 w-4 text-primary" />}
      >
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{ETA[props.priority]}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Actual times may vary based on volume and request type.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function ReviewTile({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <div className="mt-1.5 truncate text-sm text-foreground">{value}</div>
    </div>
  );
}

/* -------------------- Done -------------------- */
function DoneCard({
  ticketNumber, ticketId, isTicket, title, onAnother, backTo,
}: {
  ticketNumber: string | null; ticketId: string | null; isTicket: boolean;
  title: string; onAnother: () => void; backTo: "/tickets" | "/my-requests";
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm sm:p-10">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We've routed it to the right team. You'll be notified when there's an update.
          </p>
        </div>
        {ticketNumber && (
          <div className="rounded-lg border border-border/60 bg-background/40 px-4 py-2 text-sm">
            Reference: <span className="font-mono font-semibold text-foreground">{ticketNumber}</span>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {isTicket && ticketId && (
            <Button asChild><Link to="/tickets/$id" params={{ id: ticketId }}>Open ticket</Link></Button>
          )}
          <Button variant="outline" asChild><Link to={backTo}>Back to list</Link></Button>
          <Button variant="ghost" onClick={onAnother}>Create another</Button>
        </div>
      </div>
    </section>
  );
}

/* -------------------- Sidebar -------------------- */
function SummaryCard({
  title, step, category, subcategory, priority,
}: {
  title: string; step: 0 | 1 | 2; category: string; subcategory: string; priority: TicketPriority;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
          <FilePlus2 className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <SummaryBody step={step} category={category} subcategory={subcategory} priority={priority} />
    </div>
  );
}

function SummaryBody({
  step, category, subcategory, priority,
}: { step: 0 | 1 | 2; category: string; subcategory: string; priority: TicketPriority }) {
  const p = PRIORITIES.find((x) => x.value === priority);
  const cat = CATEGORIES.find((c) => c.value === category);
  const CatIcon = cat?.icon ?? HelpCircle;
  return (
    <>
      <dl className="space-y-3.5 text-sm">
        <Row label="Current step" value={`${step + 1}. ${STEPS[step]}`} icon={<ListChecks className="h-4 w-4 text-muted-foreground" />} />
        <Row
          label="Category"
          value={category || <span className="text-muted-foreground">Not selected</span>}
          icon={<CatIcon className="h-4 w-4 text-muted-foreground" />}
        />
        <Row
          label="Service"
          value={subcategory || <span className="text-muted-foreground">Not selected</span>}
          icon={<Tag className="h-4 w-4 text-muted-foreground" />}
        />
        <Row
          label="Priority"
          value={
            <span className="inline-flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", p?.dot)} />
              <span>{p?.label}</span>
            </span>
          }
          icon={<Flag className={cn("h-4 w-4", p?.value === "critical" ? "text-rose-400" : "text-muted-foreground")} />}
        />
        <Row label="Estimated response" value={ETA[priority]} icon={<Sparkles className="h-4 w-4 text-muted-foreground" />} />
      </dl>
    </>
  );
}

function Row({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex min-w-0 items-center gap-2 truncate text-sm text-foreground">
        {icon}<span className="truncate">{value}</span>
      </dd>
    </div>
  );
}

function TipsCard() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-semibold">Tips before submitting</h3>
      </div>
      <ul className="space-y-2">
        {TIPS.map((t) => (
          <li key={t} className="flex items-start gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------- Generic SectionCard -------------------- */
function SectionCard({
  title, description, icon, children,
}: {
  title?: string; description?: string; icon?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm sm:p-6">
      {(title || description) && (
        <header className="mb-4 flex items-start gap-2">
          {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}
