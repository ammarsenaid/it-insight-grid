import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Check,
  Inbox,
  LayoutDashboard,
  Mail,
  Palette,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Table2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { updateSettings, useData } from "@/lib/data/store";
import {
  addMailbox,
  removeMailbox,
  resetMailbox,
  updateMailbox,
  useSharedMailboxState,
  type DepartmentMailbox,
} from "@/lib/shared-mailbox-prefs";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · IT Knowledge Center" }] }),
  component: SettingsPage,
});

type Tone = "sky" | "violet" | "amber" | "emerald" | "rose";

const TONE_CLASSES: Record<
  Tone,
  { ring: string; icon: string; halo: string; chip: string }
> = {
  sky: {
    ring: "ring-sky-500/15",
    icon: "from-sky-500/25 to-sky-500/5 text-sky-300",
    halo: "from-sky-500/[0.06] via-transparent to-transparent",
    chip: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  },
  violet: {
    ring: "ring-violet-500/15",
    icon: "from-violet-500/25 to-violet-500/5 text-violet-300",
    halo: "from-violet-500/[0.06] via-transparent to-transparent",
    chip: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  },
  amber: {
    ring: "ring-amber-500/15",
    icon: "from-amber-500/25 to-amber-500/5 text-amber-300",
    halo: "from-amber-500/[0.06] via-transparent to-transparent",
    chip: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  },
  emerald: {
    ring: "ring-emerald-500/15",
    icon: "from-emerald-500/25 to-emerald-500/5 text-emerald-300",
    halo: "from-emerald-500/[0.06] via-transparent to-transparent",
    chip: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  },
  rose: {
    ring: "ring-rose-500/15",
    icon: "from-rose-500/25 to-rose-500/5 text-rose-300",
    halo: "from-rose-500/[0.06] via-transparent to-transparent",
    chip: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  },
};

type SectionDef = {
  id: string;
  label: string;
  description: string;
  icon: typeof Palette;
  tone: Tone;
};

const SECTIONS: SectionDef[] = [
  { id: "appearance", label: "Appearance", description: "Look, density, motion", icon: Palette, tone: "violet" },
  { id: "notifications", label: "Notifications", description: "In-app alerts", icon: Bell, tone: "amber" },
  { id: "tables", label: "Tables & views", description: "Defaults across lists", icon: Table2, tone: "sky" },
  { id: "dashboard", label: "Dashboard", description: "Home screen modules", icon: LayoutDashboard, tone: "emerald" },
  { id: "mailboxes", label: "Department mailboxes", description: "One inbox per team", icon: Mail, tone: "rose" },
];

function SettingsPage() {
  const data = useData();
  const s = data.settings;
  const { mailboxes } = useSharedMailboxState();
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    SECTIONS.forEach((sec) => {
      const el = document.getElementById(sec.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(id);
    }
  };

  const activeCount = mailboxes.filter((m) => m.enabled).length;

  return (
    <div className="pb-16">
      <PageHeader
        title="Settings"
        description="Personalize how IT Knowledge Center looks on this device and connect a shared mailbox per department."
        status={
          <Badge variant="outline" className="gap-1 border-border/60 bg-muted/40 text-[10px] font-medium">
            <Sparkles className="h-3 w-3 text-primary" /> Local to this browser
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <nav className="glass-card rounded-2xl p-2">
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Settings
            </p>
            <ul className="space-y-0.5">
              {SECTIONS.map((sec) => {
                const Icon = sec.icon;
                const isActive = active === sec.id;
                const tone = TONE_CLASSES[sec.tone];
                return (
                  <li key={sec.id}>
                    <button
                      type="button"
                      onClick={() => jump(sec.id)}
                      className={cn(
                        "group flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-all",
                        isActive
                          ? "bg-white/[0.04] text-foreground ring-1 ring-white/10 shadow-sm"
                          : "text-muted-foreground hover:bg-white/[0.02] hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br transition-colors",
                          isActive ? tone.icon : "from-muted/40 to-muted/10 text-muted-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 pt-0.5">
                        <span className="block text-sm font-medium leading-tight">{sec.label}</span>
                        <span className="block truncate text-[11px] text-muted-foreground/80">{sec.description}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <div className="space-y-6">
          <SettingsSection
            id="appearance"
            icon={Palette}
            tone="violet"
            title="Appearance"
            description="Tune density, motion and the navigation rail."
          >
            <Row label="Compact mode" hint="Tighter spacing across tables, cards and forms.">
              <Switch checked={s.compactMode} onCheckedChange={(v) => updateSettings({ compactMode: v })} />
            </Row>
            <Row label="Reduced motion" hint="Disable non-essential transitions and parallax.">
              <Switch checked={s.reducedMotion} onCheckedChange={(v) => updateSettings({ reducedMotion: v })} />
            </Row>
            <Row label="Sidebar collapsed by default" hint="Start each session with only icons visible.">
              <Switch checked={s.sidebarCollapsed} onCheckedChange={(v) => updateSettings({ sidebarCollapsed: v })} />
            </Row>
          </SettingsSection>

          <SettingsSection
            id="notifications"
            icon={Bell}
            tone="amber"
            title="Notifications"
            description="Control which signals reach you while you work."
          >
            <Row label="Show in-app notifications" hint="Toasts, banners and the bell counter.">
              <Switch
                checked={s.showNotifications}
                onCheckedChange={(v) => updateSettings({ showNotifications: v })}
              />
            </Row>
          </SettingsSection>

          <SettingsSection
            id="tables"
            icon={Table2}
            tone="sky"
            title="Tables & views"
            description="Default pagination and the lens used for document lists."
          >
            <Row label="Default page size" hint="Number of rows loaded per page in lists.">
              <Select
                value={String(s.tablePageSize)}
                onValueChange={(v) => updateSettings({ tablePageSize: Number(v) })}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Default document view" hint="Opening lens used when navigating to Documents.">
              <Select
                value={s.defaultDocView}
                onValueChange={(v: "table" | "cards") => updateSettings({ defaultDocView: v })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="table">Table</SelectItem>
                  <SelectItem value="cards">Cards</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </SettingsSection>

          <SettingsSection
            id="dashboard"
            icon={LayoutDashboard}
            tone="emerald"
            title="Dashboard"
            description="Show or hide modules on the home dashboard."
          >
            <Row label="Show dashboard chart" hint="Ticket volume trend on the dashboard.">
              <Switch
                checked={s.showDashboardChart}
                onCheckedChange={(v) => updateSettings({ showDashboardChart: v })}
              />
            </Row>
          </SettingsSection>

          <SettingsSection
            id="mailboxes"
            icon={Mail}
            tone="rose"
            title="Department mailboxes"
            description="Connect a shared inbox for each department. Add as many as you need."
            badge={
              <Badge variant="outline" className="border-border/60 bg-muted/30 text-[10px] text-muted-foreground">
                {activeCount} of {mailboxes.length} active
              </Badge>
            }
          >
            <div className="grid gap-3">
              {mailboxes.map((mb, i) => (
                <MailboxCard
                  key={mb.id}
                  mailbox={mb}
                  index={i}
                  canRemove={mailboxes.length > 1}
                />
              ))}

              <button
                type="button"
                onClick={() => {
                  addMailbox();
                  toast.success("Mailbox added");
                }}
                className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border/50 bg-muted/10 px-4 py-3 text-xs font-medium text-muted-foreground transition-colors hover:border-border/80 hover:bg-muted/20 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Add another department mailbox
              </button>
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

function MailboxCard({
  mailbox,
  index,
  canRemove,
}: {
  mailbox: DepartmentMailbox;
  index: number;
  canRemove: boolean;
}) {
  const t = TONE_CLASSES.sky;
  const id = mailbox.id;

  const valid = useMemo(() => {
    if (!mailbox.enabled) return true;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return (
      mailbox.department.trim().length > 0 &&
      re.test(mailbox.address.trim()) &&
      (mailbox.replyTo.trim() === "" || re.test(mailbox.replyTo.trim()))
    );
  }, [mailbox]);

  const title = mailbox.department.trim() || `Mailbox ${index + 1}`;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/50 bg-background/40 transition-colors",
        mailbox.enabled && "border-border/70 bg-background/60",
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-white/5",
              t.icon,
            )}
          >
            <Mail className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  mailbox.enabled ? t.chip : "border-border/60 bg-muted/30 text-muted-foreground",
                )}
              >
                {mailbox.enabled ? "Connected" : "Off"}
              </Badge>
            </div>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
              {mailbox.address.trim() || "No address configured yet."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canRemove && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-muted-foreground hover:text-destructive"
              onClick={() => {
                removeMailbox(id);
                toast.success("Mailbox removed");
              }}
              title="Remove mailbox"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Switch
            checked={mailbox.enabled}
            onCheckedChange={(v) => updateMailbox(id, { enabled: v })}
          />
        </div>
      </div>

      <div className="border-t border-border/40 px-4 py-4">
        <div className={cn("grid gap-4 sm:grid-cols-2", !mailbox.enabled && "pointer-events-none opacity-50")}>
          <Field label="Department" hint="The team this mailbox belongs to." required>
            <Input
              value={mailbox.department}
              disabled={!mailbox.enabled}
              placeholder="IT Operations"
              onChange={(e) => updateMailbox(id, { department: e.target.value })}
            />
          </Field>
          <Field label="Display name" hint="Friendly label shown above messages.">
            <Input
              value={mailbox.displayName}
              disabled={!mailbox.enabled}
              placeholder="IT Helpdesk"
              onChange={(e) => updateMailbox(id, { displayName: e.target.value })}
            />
          </Field>
          <Field label="Mailbox address" hint="The inbox we read from." required>
            <div className="relative">
              <Inbox className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                className="pl-8 font-mono text-xs"
                value={mailbox.address}
                disabled={!mailbox.enabled}
                placeholder="helpdesk@company.com"
                onChange={(e) => updateMailbox(id, { address: e.target.value })}
              />
            </div>
          </Field>
          <Field label="Reply-to" hint="Optional override for outgoing replies.">
            <div className="relative">
              <Send className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                className="pl-8 font-mono text-xs"
                value={mailbox.replyTo}
                disabled={!mailbox.enabled}
                placeholder="no-reply@company.com"
                onChange={(e) => updateMailbox(id, { replyTo: e.target.value })}
              />
            </div>
          </Field>
          <Field label="Sync interval" hint="How often new messages are pulled.">
            <Select
              value={String(mailbox.syncMinutes)}
              onValueChange={(v) => updateMailbox(id, { syncMinutes: Number(v) })}
            >
              <SelectTrigger disabled={!mailbox.enabled}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 5, 10, 15, 30, 60].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    Every {m} {m === 1 ? "minute" : "minutes"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Signature" hint="Appended to outgoing replies." className="sm:col-span-2">
            <Textarea
              rows={3}
              value={mailbox.signature}
              disabled={!mailbox.enabled}
              placeholder="— IT Helpdesk · helpdesk@company.com"
              onChange={(e) => updateMailbox(id, { signature: e.target.value })}
            />
          </Field>
        </div>

        <Separator className="my-4 bg-border/40" />

        <div className="grid gap-3 sm:grid-cols-2">
          <Row label="Auto-create tickets" hint="Each new email opens a ticket in the team queue.">
            <Switch
              checked={mailbox.autoCreateTickets}
              disabled={!mailbox.enabled}
              onCheckedChange={(v) => updateMailbox(id, { autoCreateTickets: v })}
            />
          </Row>
          <Row label="Notify on new message" hint="Sends an in-app notification to your device.">
            <Switch
              checked={mailbox.notifyOnNew}
              disabled={!mailbox.enabled}
              onCheckedChange={(v) => updateMailbox(id, { notifyOnNew: v })}
            />
          </Row>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground">
            Inbound sync runs on the backend mailbox service. Settings here describe how this device connects.
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                resetMailbox(id);
                toast.success("Mailbox reset");
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!valid}
              onClick={() => {
                if (!valid) {
                  toast.error("Provide a valid department and email address");
                  return;
                }
                toast.success(`${title} saved`);
              }}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" /> Save mailbox
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({
  id,
  icon: Icon,
  tone,
  title,
  description,
  badge,
  children,
}: {
  id: string;
  icon: typeof Palette;
  tone: Tone;
  title: string;
  description: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-6 relative overflow-hidden rounded-2xl border border-border/50 bg-card/60 shadow-sm ring-1 backdrop-blur-sm",
        t.ring,
      )}
    >
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b", t.halo)} />
      <header className="relative flex items-start justify-between gap-3 border-b border-border/40 px-5 py-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-white/5",
              t.icon,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {badge}
      </header>
      <div className="relative space-y-4 px-5 py-5">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-transparent px-1 py-1 transition-colors hover:border-border/30 hover:bg-muted/10">
      <div className="min-w-0">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="flex items-center gap-1 text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
