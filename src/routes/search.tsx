import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileText, Server, Network, CheckSquare, StickyNote, Search, BookOpen, ListChecks, Play } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { useData } from "@/lib/data/store";
import { useKnowledge, getAncestry } from "@/lib/knowledge/store";
import { useTeamArticles } from "@/lib/knowledge/useTeamArticles";
import { useProtocols } from "@/lib/protocols/store";

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>) => ({ q: typeof s.q === "string" ? s.q : "" }),
  head: () => ({ meta: [{ title: "Search · IT Knowledge Center" }] }),
  component: SearchPage,
});

function SearchPage() {
  const data = useData();
  const knowledge = useKnowledge();
  const protocols = useProtocols();
  const backend = useTeamArticles();
  const initial = Route.useSearch().q;
  const [q, setQ] = useState(initial);
  const ql = q.toLowerCase();
  const has = (s: string) => s.toLowerCase().includes(ql);

  const results = useMemo(() => ({
    knowledge: ql
      ? knowledge.nodes.filter(
          (n) =>
            has(n.title) ||
            has(n.description ?? "") ||
            has(n.content ?? "") ||
            n.tags.some((t) => has(t)) ||
            has(n.ownerId) ||
            has(n.status),
        )
      : [],
    assets: ql ? data.assets.filter((a) => has(a.hostname) || has(a.displayName) || has(a.ipAddress)) : [],
    ipam: ql ? data.ipam.filter((i) => has(i.ipAddress) || has(i.hostname)) : [],
    tasks: ql ? data.tasks.filter((t) => has(t.title)) : [],
    notes: ql ? data.notes.filter((n) => has(n.title) || has(n.content)) : [],
    protocolTemplates: ql ? protocols.templates.filter((t) => has(t.title) || has(t.category) || t.tags.some((tg) => has(tg))) : [],
    protocolRuns: ql ? protocols.runs.filter((r) => has(r.templateTitle) || has(r.runNumber) || has(r.assignedUser ?? "")) : [],
    backendArticles: ql
      ? backend.articles.filter((a) => has(a.title) || has(a.excerpt ?? "") || has(a.status))
      : [],
  }), [data, knowledge, protocols, backend, ql]);

  const total = Object.values(results).reduce((a, b) => a + b.length, 0);

  return (
    <div>
      <PageHeader title="Global Search" description="Search across knowledge pages, CMDB assets, IP addresses, tasks, and notes." />
      <div className="glass-card rounded-2xl p-4">
        <SearchInput value={q} onChange={setQ} placeholder="Type to search everywhere..." />
        <div className="mt-2 text-xs text-muted-foreground">{ql ? `${total} results` : "Type a query to begin"}</div>
      </div>

      <div className="mt-6 space-y-6">
        <Group
          icon={BookOpen}
          title="Knowledge Base"
          items={results.knowledge.map((n) => {
            const path = getAncestry(n.id, knowledge.nodes)
              .slice(0, -1)
              .map((a) => a.title)
              .join(" / ");
            return {
              id: n.id,
              title: n.title,
              sub: `${path || "Top level"} · ${n.status}`,
              to: `/documents?k=${n.id}`,
            };
          })}
        />
        <Group icon={Server} title="CMDB Assets" items={results.assets.map((a) => ({ id: a.id, title: a.hostname, sub: `${a.displayName} · ${a.ipAddress}`, to: "/cmdb" }))} />
        <Group icon={Network} title="IP Addresses" items={results.ipam.map((i) => ({ id: i.id, title: i.ipAddress, sub: `${i.hostname} · ${i.subnet}`, to: "/ipam" }))} />
        <Group icon={CheckSquare} title="Tasks" items={results.tasks.map((t) => ({ id: t.id, title: t.title, sub: `${t.category} · ${t.status}`, to: "/tasks" }))} />
        <Group icon={StickyNote} title="Notes" items={results.notes.map((n) => ({ id: n.id, title: n.title, sub: n.category, to: "/notes" }))} />
        <Group icon={ListChecks} title="Protocol Templates" items={results.protocolTemplates.map((t) => ({ id: t.id, title: t.title, sub: `${t.category} · ${t.steps.length} steps`, to: "/protocols" }))} />
        <Group icon={Play} title="Protocol Runs" items={results.protocolRuns.map((r) => ({ id: r.id, title: `${r.runNumber} · ${r.templateTitle}`, sub: `${r.status} · ${r.assignedUser ?? "Unassigned"}`, to: `/protocols/${r.id}` }))} />
        <Group icon={FileText} title="Documents" items={[]} />
        {!ql && (
          <div className="grid place-items-center rounded-2xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground"><Search className="mb-2 h-6 w-6" />Start typing to search</div>
        )}
      </div>
    </div>
  );
}

function Group({ icon: Icon, title, items }: { icon: typeof FileText; title: string; items: { id: string; title: string; sub: string; to: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> {title}</div>
        <StatusBadge tone="info" label={String(items.length)} />
      </div>
      <div className="space-y-1">
        {items.slice(0, 8).map((it) => (
          <div key={it.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-white/[0.03]">
            <div className="min-w-0"><div className="truncate text-sm font-medium">{it.title}</div><div className="truncate text-xs text-muted-foreground">{it.sub}</div></div>
            <Link to={it.to}><Button size="sm" variant="ghost">Open</Button></Link>
          </div>
        ))}
      </div>
    </div>
  );
}
