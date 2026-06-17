import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  FilePlus2,
  Flag,
  Flame,
  Laptop,
  AppWindow,
  KeyRound,
  Wifi,
  Printer as PrinterIcon,
  Mail,
  ShieldCheck,
  HelpCircle,
  Lightbulb,
  Save,
  Search,
  Sparkles,
  UploadCloud,
  X,
  CheckCircle2,
  Bold,
  Italic,
  List as ListIcon,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { useAuth } from "@/lib/auth/AuthProvider";
import { createTicket } from "@/lib/service-desk/tickets";
import type { TicketPriority, TicketType } from "@/lib/service-desk/types";

export type WizardMode = "ticket" | "request";

const CATEGORIES = [
  { value: "Hardware", label: "Hardware", icon: Laptop, services: ["Laptop / Desktop", "Monitor", "Peripherals", "Mobile device"] },
  { value: "Software", label: "Software", icon: AppWindow, services: ["Install application", "Update / Upgrade", "License request", "Bug or crash"] },
  { value: "Account & Access", label: "Access /\nAccount", icon: KeyRound, services: ["Password reset", "MFA reset", "New account", "Permissions / role"] },
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

const POPULAR = [
  "Laptop performance issue",
  "Request new hardware",
  "Software installation",
  "Email not syncing",
  "VPN connection issue",
];

const TIPS = [
  "Search our knowledge base for quick answers",
  "Provide as much detail as possible",
  "Include screenshots if applicable",
  "Double-check attachments",
];

const STEPS = ["Details", "Review", "Submit"] as const;

type Props = {
  mode: WizardMode;
  // route to navigate to on cancel/back
  backTo: "/tickets" | "/my-requests";
  // path for "Home" breadcrumb
  homeTo?: string;
};

export function TicketWizard({ mode, backTo, homeTo = "/" }: Props) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user?.id ?? "";

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [category, setCategory] = useState<string>("Hardware");
  const [subcategory, setSubcategory] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [type, setType] = useState<TicketType>(mode === "ticket" ? "incident" : "request");
  const [device, setDevice] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [createdNumber, setCreatedNumber] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const activeCategory = CATEGORIES.find((c) => c.value === category) ?? CATEGORIES[0];

  const titleOk = title.trim().length >= 4;
  const descOk = description.trim().length >= 8;
  const subcatOk = Boolean(subcategory);
  const canNext = Boolean(category) && titleOk && descOk && subcatOk;

  const isTicket = mode === "ticket";
  const labels = isTicket
    ? {
        page: "Create Ticket",
        intro: "Capture the issue, route it to the right team, and start the resolution clock.",
        crumb: "New Ticket",
        submit: "Create ticket",
        summary: "Ticket summary",
        successTitle: "Ticket created",
      }
    : {
        page: "Create Request",
        intro: "Tell us what you need help with and we'll get it to the right team.",
        crumb: "New Request",
        submit: "Submit request",
        summary: "Request summary",
        successTitle: "Request submitted",
      };

  const mutation = useMutation({
    mutationFn: async () => {
      return createTicket(userId, {
        subject: title.trim(),
        description: description.trim(),
        type,
        category,
        subcategory: subcategory || null,
        priority,
        tags: device ? [device.toLowerCase().slice(0, 24)] : [],
      });
    },
    onSuccess: (t) => {
      setCreatedNumber(t.ticketNumber);
      setCreatedId(t.id);
      setStep(2);
      toast.success(`${isTicket ? "Ticket" : "Request"} ${t.ticketNumber} created`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Submission failed"),
  });

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= 6) break;
      if (f.size > 25 * 1024 * 1024) {
        toast.error(`${f.name} exceeds 25 MB`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
  };

  const removeFile = (i: number) => setFiles(files.filter((_, idx) => idx !== i));

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Breadcrumb + back */}
      <div className="mb-5 flex items-center gap-2 text-xs text-muted-foreground">
        <Link to={homeTo} className="hover:text-foreground transition-colors">
          Home
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link to={backTo} className="hover:text-foreground transition-colors">
          {isTicket ? "Tickets" : "My Requests"}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground">{labels.crumb}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main */}
        <div className="space-y-6">
          {/* Hero card */}
          <div className="flex items-start gap-4 rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent text-primary ring-1 ring-primary/30">
              <FilePlus2 className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{labels.page}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{labels.intro}</p>
            </div>
            <div className="hidden min-w-[160px] shrink-0 sm:block">
              <div className="text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Step {step + 1} of {STEPS.length}
              </div>
              <div className="mt-2 flex gap-1.5">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-colors",
                      i <= step ? "bg-primary" : "bg-muted",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          {step === 0 && (
            <StepDetails
              category={category}
              setCategory={(v) => {
                setCategory(v);
                setSubcategory("");
              }}
              subcategory={subcategory}
              setSubcategory={setSubcategory}
              activeCategory={activeCategory}
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
            />
          )}

          {step === 1 && (
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

          {step === 2 && (
            <StepDone
              ticketNumber={createdNumber}
              ticketId={createdId}
              isTicket={isTicket}
              title={labels.successTitle}
              onAnother={() => {
                setStep(0);
                setTitle("");
                setDescription("");
                setSubcategory("");
                setDevice("");
                setFiles([]);
                setPriority("normal");
                setCreatedNumber(null);
                setCreatedId(null);
              }}
              backTo={backTo}
            />
          )}

          {/* Footer actions */}
          {step !== 2 && (
            <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/80 px-4 py-3 shadow-lg backdrop-blur">
              <div className="flex items-center gap-2">
                {step === 0 ? (
                  <Button variant="ghost" onClick={() => navigate({ to: backTo })}>
                    <ArrowLeft className="mr-1.5 h-4 w-4" /> Cancel
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setStep(0)}>
                    <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
                  </Button>
                )}
                <div className="hidden text-[11px] text-muted-foreground sm:block">
                  {canNext ? (
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <Check className="h-3 w-3" /> Looks good — ready for review
                    </span>
                  ) : (
                    <span>Pick a category, service, title (≥4), description (≥8)</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => toast.success("Draft saved locally")}
                  className="gap-1.5"
                >
                  <Save className="h-4 w-4" /> Save Draft
                </Button>
                {step === 0 ? (
                  <Button onClick={() => setStep(1)} disabled={!canNext} className="gap-1.5">
                    Next: Review <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      if (!userId) return toast.error("You must be signed in");
                      mutation.mutate();
                    }}
                    disabled={mutation.isPending}
                    className="gap-1.5"
                  >
                    {mutation.isPending ? "Submitting…" : labels.submit}
                    {!mutation.isPending && <Check className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <SummaryCard
            title={labels.summary}
            category={category}
            subcategory={subcategory}
            priority={priority}
            eta={ETA[priority]}
          />
          <PopularCard />
          <TipsCard />
        </aside>
      </div>
    </div>
  );
}

/* ----------- Step 1 ----------- */
function StepDetails(props: {
  category: string;
  setCategory: (v: string) => void;
  subcategory: string;
  setSubcategory: (v: string) => void;
  activeCategory: (typeof CATEGORIES)[number];
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  priority: TicketPriority;
  setPriority: (v: TicketPriority) => void;
  device: string;
  setDevice: (v: string) => void;
  files: File[];
  onPickFiles: (l: FileList | null) => void;
  removeFile: (i: number) => void;
  isTicket: boolean;
  type: TicketType;
  setType: (v: TicketType) => void;
}) {
  const {
    category,
    setCategory,
    subcategory,
    setSubcategory,
    activeCategory,
    title,
    setTitle,
    description,
    setDescription,
    priority,
    setPriority,
    device,
    setDevice,
    files,
    onPickFiles,
    removeFile,
    isTicket,
    type,
    setType,
  } = props;

  return (
    <>
      {/* Categories */}
      <Card title="1. Choose a category">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={cn(
                  "group relative flex h-[110px] flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center transition-all",
                  "hover:-translate-y-0.5 hover:border-border hover:shadow-md hover:shadow-primary/5",
                  active
                    ? "border-primary/60 bg-primary/10 ring-1 ring-primary/40"
                    : "border-border/60 bg-background/40",
                )}
                aria-pressed={active}
              >
                <Icon
                  className={cn(
                    "h-7 w-7 transition-colors",
                    active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                <span
                  className={cn(
                    "whitespace-pre-line text-xs font-medium leading-tight",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {c.label}
                </span>
                {active && (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Form */}
      <Card>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left col */}
          <div className="space-y-5">
            <Field
              label="2. Request title"
              required
              hint={`Keep it short and specific (e.g., "Laptop not turning on")`}
              counter={`${title.length} / 100`}
            >
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Briefly describe your request"
                maxLength={100}
                className="h-11"
              />
            </Field>

            <Field
              label="4. Description / What do you need?"
              required
              hint="The more details you provide, the faster we can help."
              counter={`${description.length} / 2000`}
            >
              <div className="rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
                <Textarea
                  rows={6}
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide more details about the issue or request…"
                  className="resize-none border-0 focus-visible:ring-0"
                />
                <div className="flex items-center gap-0.5 border-t border-border/60 px-2 py-1.5 text-muted-foreground">
                  {[Bold, Italic, ListIcon, ListOrdered, LinkIcon, ImageIcon].map((I, i) => (
                    <button
                      key={i}
                      type="button"
                      className="rounded p-1.5 hover:bg-muted hover:text-foreground"
                      tabIndex={-1}
                    >
                      <I className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              </div>
            </Field>
          </div>

          {/* Right col */}
          <div className="space-y-5">
            <Field
              label="3. Service / Subtype"
              required
              hint="Choose the option that best matches your request."
            >
              <Select value={subcategory} onValueChange={setSubcategory}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select a service or issue type" />
                </SelectTrigger>
                <SelectContent>
                  {activeCategory.services.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="5. Priority / Urgency"
              required
              hint="Select the impact and urgency of your request."
            >
              <div className="grid grid-cols-1 gap-1.5">
                {PRIORITIES.map((p) => {
                  const active = priority === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      className={cn(
                        "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-all",
                        active
                          ? "border-primary/60 bg-primary/10 ring-1 ring-primary/40"
                          : "border-border/60 bg-background/40 hover:border-border",
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className={cn("h-2 w-2 rounded-full", p.dot)} />
                        <span className="text-sm font-medium">{p.label}</span>
                        <span className="text-[11px] text-muted-foreground">{p.description}</span>
                      </span>
                      {active && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field
              label={`6. Affected device or location`}
              optional
              hint="This helps us route your request faster."
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  placeholder="Search or select a device / location"
                  className="h-11 pl-9"
                />
              </div>
            </Field>

            {isTicket && (
              <Field label="Ticket type" hint="Defaults to incident. Change for problems/changes.">
                <Select value={type} onValueChange={(v) => setType(v as TicketType)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["request", "incident", "problem", "change"] as TicketType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
        </div>
      </Card>

      {/* Attachments */}
      <Card title="7. Attachments" optional>
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 bg-background/40 px-4 py-8 text-center transition-colors",
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
            <span className="font-medium text-foreground">Drag and drop files here, </span>
            <span className="font-medium text-primary">or browse</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Max file size: 25MB per file. Supported formats: JPG, PNG, PDF, DOCX, TXT, ZIP
          </p>
        </label>

        {files.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs"
              >
                <span className="truncate">
                  <span className="font-medium text-foreground">{f.name}</span>
                  <span className="ml-2 text-muted-foreground">
                    {(f.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/* ----------- Step 2 ----------- */
function StepReview(props: {
  category: string;
  subcategory: string;
  title: string;
  description: string;
  priority: TicketPriority;
  device: string;
  files: File[];
  type: TicketType;
  isTicket: boolean;
}) {
  const p = PRIORITIES.find((x) => x.value === props.priority);
  return (
    <Card title="Review your submission" hint="Make sure everything below is correct, then submit.">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <ReviewRow label="Category" value={props.category} />
        <ReviewRow label="Service / Subtype" value={props.subcategory || "—"} />
        <ReviewRow label="Title" value={props.title} />
        <ReviewRow
          label="Priority"
          value={
            <span className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", p?.dot)} />
              {p?.label}
            </span>
          }
        />
        <ReviewRow label="Affected device" value={props.device || "—"} />
        {props.isTicket && <ReviewRow label="Type" value={props.type} />}
        <ReviewRow
          label="Attachments"
          value={props.files.length ? `${props.files.length} file(s)` : "None"}
        />
      </dl>
      <div className="mt-5 space-y-1.5">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Description
        </div>
        <p className="whitespace-pre-wrap rounded-lg border border-border/60 bg-background/40 p-3 text-sm leading-relaxed">
          {props.description}
        </p>
      </div>
    </Card>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

/* ----------- Step 3 (Done) ----------- */
function StepDone({
  ticketNumber,
  ticketId,
  isTicket,
  title,
  onAnother,
  backTo,
}: {
  ticketNumber: string | null;
  ticketId: string | null;
  isTicket: boolean;
  title: string;
  onAnother: () => void;
  backTo: "/tickets" | "/my-requests";
}) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
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
            Reference:{" "}
            <span className="font-mono font-semibold text-foreground">{ticketNumber}</span>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {isTicket && ticketId && (
            <Button asChild>
              <Link to="/tickets/$id" params={{ id: ticketId }}>
                Open ticket
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to={backTo}>Back to list</Link>
          </Button>
          <Button variant="ghost" onClick={onAnother}>
            Create another
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ----------- Sidebar cards ----------- */
function SummaryCard({
  title,
  category,
  subcategory,
  priority,
  eta,
}: {
  title: string;
  category: string;
  subcategory: string;
  priority: TicketPriority;
  eta: string;
}) {
  const p = PRIORITIES.find((x) => x.value === priority);
  const cat = CATEGORIES.find((c) => c.value === category);
  const CatIcon = cat?.icon ?? HelpCircle;
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
          <FilePlus2 className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <dl className="space-y-3.5 text-sm">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Category
          </dt>
          <dd className="mt-1 flex items-center gap-2">
            <CatIcon className="h-4 w-4 text-muted-foreground" />
            <span>{category}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Service
          </dt>
          <dd className={cn("mt-1 flex items-center gap-2", !subcategory && "text-muted-foreground")}>
            <ListIcon className="h-4 w-4 text-muted-foreground" />
            <span>{subcategory || "Not selected"}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Priority
          </dt>
          <dd className="mt-1 flex items-center gap-2">
            <Flag className={cn("h-4 w-4", p?.value === "critical" ? "text-rose-400" : "text-muted-foreground")} />
            <span>{p?.label}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Estimated response
          </dt>
          <dd className="mt-1 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span>{eta}</span>
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-[11px] text-primary">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Response times may vary based on volume and request type.</span>
      </div>
    </div>
  );
}

function PopularCard() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Flame className="h-4 w-4 text-orange-400" />
        <h3 className="text-sm font-semibold">Popular requests</h3>
      </div>
      <ul className="space-y-1">
        {POPULAR.map((p) => (
          <li key={p}>
            <button
              type="button"
              className="group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <span className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="h-5 w-5 justify-center rounded-md bg-muted/60 p-0 text-[10px]"
                >
                  ✦
                </Badge>
                {p}
              </span>
              <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          </li>
        ))}
      </ul>
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

/* ----------- Layout primitives ----------- */
function Card({
  title,
  hint,
  optional,
  children,
}: {
  title?: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm sm:p-6">
      {(title || hint) && (
        <header className="mb-4">
          {title && (
            <h2 className="text-sm font-semibold tracking-tight">
              {title}
              {optional && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
              )}
            </h2>
          )}
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  optional,
  hint,
  counter,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  counter?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
          {optional && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
          )}
        </Label>
        {counter && <span className="text-[10px] tabular-nums text-muted-foreground">{counter}</span>}
      </div>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
