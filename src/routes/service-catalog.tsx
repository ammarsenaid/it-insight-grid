import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Lucide from "lucide-react";
import { ShoppingBag, Search, Inbox, Clock, AlertCircle } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { useAuth } from "@/lib/auth/AuthProvider";
import { catalogPublishedQuery } from "@/lib/service-desk/queries";
import type { CatalogItem } from "@/lib/service-desk/types";

export const Route = createFileRoute("/service-catalog")({
  head: () => ({ meta: [{ title: "Service Catalog · IT Knowledge Center" }] }),
  component: ServiceCatalog,
});

function ServiceCatalog() {
  const { session, loading: authLoading } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const enabled = Boolean(session?.user);
  const { data, isLoading, isError, error } = useQuery({
    ...catalogPublishedQuery(),
    enabled,
  });
  const published = data ?? [];

  const categories = useMemo(
    () => Array.from(new Set(published.map((c) => c.category))).sort(),
    [published],
  );
  const filtered = useMemo(() => {
    let list = published.slice();
    if (category !== "all") list = list.filter((c) => c.category === category);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [published, category, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    filtered.forEach((c) => {
      const arr = map.get(c.category) ?? [];
      arr.push(c);
      map.set(c.category, arr);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
  };
  const filtersActive = query.trim() !== "" || category !== "all";

  return (
    <div>
      <PageHeader
        title="Service Catalog"
        description="Request common IT services and support."
        actions={
          <Link to="/my-requests">
            <Button variant="secondary" size="sm">
              <Inbox className="mr-1.5 h-4 w-4" /> My requests
            </Button>
          </Link>
        }
      />

      {!session && !authLoading ? (
        <EmptyState
          icon={ShoppingBag}
          title="Sign in required"
          description="You need to sign in to browse the IT service catalog."
          actionLabel="Sign in"
          onAction={() => window.location.assign("/auth")}
        />
      ) : isLoading || authLoading ? (
        <div className="glass-card rounded-2xl p-6 text-sm text-muted-foreground">Loading catalog…</div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Could not load catalog"
          description={error instanceof Error ? error.message : "Unexpected error."}
        />
      ) : (
        <>
          <div className="glass-card mb-4 rounded-2xl p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search services"
                className="h-10 pl-9"
              />
            </div>
            {categories.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <CategoryChip
                  label="All"
                  active={category === "all"}
                  onClick={() => setCategory("all")}
                />
                {categories.map((c) => (
                  <CategoryChip
                    key={c}
                    label={c}
                    active={category === c}
                    onClick={() => setCategory(c)}
                  />
                ))}
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            published.length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title="No services available"
                description="The service catalog has not been configured yet."
              />
            ) : (
              <EmptyState
                icon={Search}
                title="No services found"
                description="Try another search term or category."
                actionLabel={filtersActive ? "Clear filters" : undefined}
                onAction={filtersActive ? clearFilters : undefined}
              />
            )
          ) : (
            <div className="space-y-6">
              {grouped.map(([cat, items]) => (
                <section key={cat}>
                  <div className="mb-2 flex items-center gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      {cat}
                    </h2>
                    <span className="text-[11px] text-muted-foreground">({items.length})</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {items.map((c) => (
                      <CatalogCard key={c.id} item={c} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border/60 bg-background/40 text-muted-foreground hover:bg-white/[0.04]"
      }`}
    >
      {label}
    </button>
  );
}

function CatalogCard({ item }: { item: CatalogItem }) {
  const Icon =
    (Lucide as unknown as Record<string, React.ComponentType<{ className?: string }>>)[item.icon] ??
    ShoppingBag;
  return (
    <Link
      to="/service-catalog/$id"
      params={{ id: item.id }}
      className="glass-card group flex h-full flex-col gap-3 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:border-white/10 hover:shadow-lg hover:shadow-primary/10"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold tracking-tight">{item.name}</h3>
          <p className="truncate text-[11px] text-muted-foreground">{item.category}</p>
        </div>
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
      <div className="mt-auto flex items-center justify-between text-[11px] text-muted-foreground">
        {item.estimatedTime ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {item.estimatedTime}
          </span>
        ) : (
          <span />
        )}
        <span className="text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Request →
        </span>
      </div>
    </Link>
  );
}
