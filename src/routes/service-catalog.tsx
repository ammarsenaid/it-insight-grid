import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as Lucide from "lucide-react";
import { ShoppingBag, Search, Inbox, Clock } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { useData } from "@/lib/data/store";
import type { CatalogItem } from "@/lib/data/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/service-catalog")({
  head: () => ({ meta: [{ title: "Service Catalog · IT Knowledge Center" }] }),
  component: ServiceCatalog,
});

function ServiceCatalog() {
  const data = useData();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const categories = useMemo(() => Array.from(new Set(data.catalog.map((c) => c.category))).sort(), [data.catalog]);
  const filtered = useMemo(() => {
    let list = data.catalog.slice();
    if (category !== "all") list = list.filter((c) => c.category === category);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));
    }
    return list;
  }, [data.catalog, category, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    filtered.forEach((c) => {
      const arr = map.get(c.category) ?? [];
      arr.push(c);
      map.set(c.category, arr);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div>
      <PageHeader
        title="Service Catalog"
        description="Browse standard IT services and submit a structured request in a few clicks."
      />

      <FilterBar query={query} onQueryChange={setQuery} placeholder="Search services…">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[180px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title="No services match" description="Try a different category or search term." />
      ) : (
        <div className="space-y-6">
          {grouped.map(([cat, items]) => (
            <section key={cat}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{cat}</h2>
                <StatusBadge label={String(items.length)} tone="muted" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((c) => <CatalogCard key={c.id} item={c} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function CatalogCard({ item }: { item: CatalogItem }) {
  const Icon = (Lucide as unknown as Record<string, React.ComponentType<{ className?: string }>>)[item.icon] ?? ShoppingBag;
  return (
    <Link to="/service-catalog/$id" params={{ id: item.id }} className="glass-card group flex h-full flex-col gap-3 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:border-white/10 hover:shadow-lg hover:shadow-primary/10">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <StatusBadge label={item.defaultPriority} tone={item.defaultPriority === "critical" ? "danger" : item.defaultPriority === "high" ? "warning" : "muted"} />
      </div>
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{item.name}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
      </div>
      <div className="mt-auto flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{item.category}</span>
        <span>{item.estimatedTime}</span>
      </div>
    </Link>
  );
}
