/**
 * BookStack-style UI clone for /documents.
 *
 * PURE FRONTEND — no Supabase, no fetches, no auth. All data lives in
 * local React state seeded from MOCK below so the layout and interactions
 * can be reviewed independently of the real backend.
 *
 * Hierarchy mirrors BookStack exactly:
 *   Shelf  →  Book  →  Chapter  →  Page
 *
 * Theme: existing dark design tokens only.
 */
import { useMemo, useState, useEffect, useRef } from "react";
import {
  Library,
  BookOpen,
  Book as BookIcon,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  Search,
  Plus,
  Edit3,
  Trash2,
  Clock,
  Star,
  Eye,
  ArrowLeft,
  Home,
  Tag,
  Save,
  Code2,
  Type,
  X,
  MoreHorizontal,
  Download,
  History,
  MessageSquare,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Markdown } from "@/components/common/Markdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Mock data (UI only)
// ─────────────────────────────────────────────────────────────
interface Page {
  id: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
  updatedBy: string;
  views: number;
  draft?: boolean;
}
interface Chapter {
  id: string;
  name: string;
  description: string;
  pages: Page[];
}
interface Book {
  id: string;
  name: string;
  description: string;
  color: string;
  chapters: Chapter[];
  loosePages: Page[];
  updatedAt: string;
}
interface Shelf {
  id: string;
  name: string;
  description: string;
  color: string;
  bookIds: string[];
}

const COLORS = [
  "from-rose-500/70 to-orange-500/60",
  "from-emerald-500/70 to-teal-500/60",
  "from-indigo-500/70 to-violet-500/60",
  "from-sky-500/70 to-cyan-500/60",
  "from-amber-500/70 to-pink-500/60",
  "from-fuchsia-500/70 to-purple-500/60",
];

const MOCK_BOOKS: Book[] = [
  {
    id: "b1",
    name: "Infrastructure Runbooks",
    description: "Day-2 operations for our production fleet.",
    color: COLORS[0],
    updatedAt: "2 hours ago",
    chapters: [
      {
        id: "c1",
        name: "Networking",
        description: "VLANs, firewalls and VPN.",
        pages: [
          {
            id: "p1",
            title: "Configuring the edge firewall",
            content:
              "# Configuring the edge firewall\n\nThis runbook walks through provisioning a new edge firewall pair using our standard zero-touch process.\n\n## Prerequisites\n\n- Console access via OOB\n- Two unallocated `/29` blocks\n- Vendor licence key\n\n## Procedure\n\n1. **Rack and cable** both units to ToR-A and ToR-B.\n2. Run `bootstrap --pair` to form the HA cluster.\n3. Push the baseline policy:\n\n```bash\nfw push --baseline edge.yaml --commit\n```\n\n> Always verify failover with `fw failover --dry-run` before leaving the site.\n\n## Verification\n\n| Check | Expected |\n|-------|----------|\n| `show ha` | `active/standby` |\n| `show int` | both uplinks up |\n| Ping test | < 2ms |",
            tags: ["network", "firewall", "runbook"],
            updatedAt: "2 hours ago",
            updatedBy: "Alex Morgan",
            views: 142,
          },
          {
            id: "p2",
            title: "Site-to-site VPN setup",
            content:
              "# Site-to-site VPN setup\n\nStandard IPsec configuration for branch sites.\n\n## IKE phase 1\n\n- AES-256\n- SHA-256\n- DH group 14\n\n## IKE phase 2\n\n- AES-256-GCM\n- PFS group 14\n- Lifetime: 3600s",
            tags: ["network", "vpn"],
            updatedAt: "yesterday",
            updatedBy: "Sam Lee",
            views: 88,
          },
        ],
      },
      {
        id: "c2",
        name: "Storage",
        description: "SAN, NAS and object storage.",
        pages: [
          {
            id: "p3",
            title: "Expanding a SAN volume",
            content:
              "# Expanding a SAN volume\n\nUse this when a tenant's volume reaches 80% utilisation.\n\n## Steps\n\n1. Snapshot the volume.\n2. Expand on the array.\n3. Rescan on every initiator.\n4. Grow the filesystem online.",
            tags: ["storage", "san"],
            updatedAt: "3 days ago",
            updatedBy: "Jordan Patel",
            views: 53,
          },
        ],
      },
    ],
    loosePages: [
      {
        id: "p4",
        title: "On-call escalation policy",
        content:
          "# On-call escalation policy\n\n## Severities\n\n- **SEV1** — page primary immediately, secondary at 10m.\n- **SEV2** — page primary, escalate at 30m.\n- **SEV3** — ticket only.",
        tags: ["policy", "oncall"],
        updatedAt: "1 week ago",
        updatedBy: "Alex Morgan",
        views: 211,
      },
    ],
  },
  {
    id: "b2",
    name: "Windows Administration",
    description: "AD, Group Policy and endpoint management.",
    color: COLORS[1],
    updatedAt: "yesterday",
    chapters: [
      {
        id: "c3",
        name: "Active Directory",
        description: "Forest, domains and trusts.",
        pages: [
          {
            id: "p5",
            title: "Joining a server to the domain",
            content:
              "# Joining a server to the domain\n\n```powershell\nAdd-Computer -DomainName corp.example.com -Restart\n```\n\nVerify with `nltest /sc_query:corp.example.com`.",
            tags: ["windows", "ad"],
            updatedAt: "yesterday",
            updatedBy: "Riley Chen",
            views: 76,
          },
        ],
      },
    ],
    loosePages: [],
  },
  {
    id: "b3",
    name: "Linux Cookbook",
    description: "Recipes for the systems we run.",
    color: COLORS[2],
    updatedAt: "4 days ago",
    chapters: [],
    loosePages: [
      {
        id: "p6",
        title: "Hardening sshd",
        content:
          "# Hardening sshd\n\nDisable password auth, enforce key-only access, restrict ciphers.",
        tags: ["linux", "security"],
        updatedAt: "4 days ago",
        updatedBy: "Sam Lee",
        views: 134,
      },
    ],
  },
  {
    id: "b4",
    name: "Security & Compliance",
    description: "Controls, audits, incident response.",
    color: COLORS[3],
    updatedAt: "1 week ago",
    chapters: [],
    loosePages: [],
  },
  {
    id: "b5",
    name: "Service Desk Playbooks",
    description: "Triage, escalation and customer comms.",
    color: COLORS[4],
    updatedAt: "2 weeks ago",
    chapters: [],
    loosePages: [],
  },
];

const MOCK_SHELVES: Shelf[] = [
  {
    id: "s1",
    name: "Operations",
    description: "Everything the on-call engineer needs.",
    color: COLORS[0],
    bookIds: ["b1", "b3"],
  },
  {
    id: "s2",
    name: "Platforms",
    description: "OS-specific knowledge and tooling.",
    color: COLORS[2],
    bookIds: ["b2", "b3"],
  },
  {
    id: "s3",
    name: "Governance",
    description: "Policy, compliance and audit trails.",
    color: COLORS[3],
    bookIds: ["b4"],
  },
  {
    id: "s4",
    name: "Service Desk",
    description: "Customer-facing operations.",
    color: COLORS[4],
    bookIds: ["b5"],
  },
];

// ─────────────────────────────────────────────────────────────
// Navigation state
// ─────────────────────────────────────────────────────────────
type View =
  | { kind: "home" }
  | { kind: "shelves" }
  | { kind: "shelf"; id: string }
  | { kind: "books" }
  | { kind: "book"; id: string }
  | { kind: "chapter"; bookId: string; chapterId: string }
  | { kind: "page"; bookId: string; pageId: string }
  | { kind: "edit"; bookId: string; pageId: string }
  | { kind: "recent" }
  | { kind: "tag"; tag: string };

// ─────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────
export function BookStackUI() {
  const [books, setBooks] = useState<Book[]>(MOCK_BOOKS);
  const [shelves] = useState<Shelf[]>(MOCK_SHELVES);
  const [view, setView] = useState<View>({ kind: "home" });
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(
    new Set(["b1"]),
  );
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    new Set(["c1"]),
  );
  const [search, setSearch] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>(["p1", "p4", "p5"]);

  const allPages = useMemo(
    () =>
      books.flatMap((b) => [
        ...b.chapters.flatMap((c) =>
          c.pages.map((p) => ({ page: p, book: b, chapter: c as Chapter | null })),
        ),
        ...b.loosePages.map((p) => ({ page: p, book: b, chapter: null as Chapter | null })),
      ]),
    [books],
  );

  const recent = useMemo(
    () =>
      recentIds
        .map((id) => allPages.find((x) => x.page.id === id))
        .filter((x): x is { page: Page; book: Book; chapter: Chapter | null } => !!x),
    [recentIds, allPages],
  );

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allPages.filter(
      ({ page }) =>
        page.title.toLowerCase().includes(q) ||
        page.content.toLowerCase().includes(q) ||
        page.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [search, allPages]);

  // Track recent on page open
  useEffect(() => {
    if (view.kind === "page") {
      setRecentIds((prev) => {
        const next = [view.pageId, ...prev.filter((id) => id !== view.pageId)];
        return next.slice(0, 8);
      });
    }
  }, [view]);

  function toggleBook(id: string) {
    setExpandedBooks((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleChapter(id: string) {
    setExpandedChapters((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function updatePage(bookId: string, pageId: string, patch: Partial<Page>) {
    setBooks((prev) =>
      prev.map((b) => {
        if (b.id !== bookId) return b;
        return {
          ...b,
          chapters: b.chapters.map((c) => ({
            ...c,
            pages: c.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)),
          })),
          loosePages: b.loosePages.map((p) =>
            p.id === pageId ? { ...p, ...patch } : p,
          ),
        };
      }),
    );
  }

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-[280px_1fr] gap-3 overflow-hidden">
      {/* ─── Left sidebar ─── */}
      <aside className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Library className="h-4 w-4 text-primary" />
            Documents
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Shelves · Books · Chapters · Pages
          </p>
        </div>

        <div className="px-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all books…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 px-2 text-sm">
          <SideLink
            icon={Home}
            label="Home"
            active={view.kind === "home"}
            onClick={() => setView({ kind: "home" })}
          />
          <SideLink
            icon={Library}
            label="Shelves"
            active={view.kind === "shelves" || view.kind === "shelf"}
            onClick={() => setView({ kind: "shelves" })}
            badge={shelves.length}
          />
          <SideLink
            icon={BookOpen}
            label="Books"
            active={view.kind === "books" || view.kind === "book"}
            onClick={() => setView({ kind: "books" })}
            badge={books.length}
          />
          <SideLink
            icon={Clock}
            label="Recently viewed"
            active={view.kind === "recent"}
            onClick={() => setView({ kind: "recent" })}
          />
        </nav>

        <div className="border-t border-border/40 px-2 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          <div className="px-2 pb-1">Book tree</div>
        </div>
        <div className="flex-1 overflow-y-auto px-1 pb-3">
          {books.map((book) => {
            const open = expandedBooks.has(book.id);
            const bookActive =
              (view.kind === "book" && view.id === book.id) ||
              (view.kind === "page" && view.bookId === book.id) ||
              (view.kind === "chapter" && view.bookId === book.id) ||
              (view.kind === "edit" && view.bookId === book.id);
            return (
              <div key={book.id} className="mb-0.5">
                <div
                  className={cn(
                    "group flex items-center gap-1 rounded-md px-1.5 py-1 text-xs",
                    bookActive && "bg-primary/10 text-primary",
                  )}
                >
                  <button
                    onClick={() => toggleBook(book.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {open ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    onClick={() => setView({ kind: "book", id: book.id })}
                    className="flex flex-1 items-center gap-1.5 truncate text-left"
                  >
                    <BookIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{book.name}</span>
                  </button>
                </div>
                {open && (
                  <div className="ml-4 border-l border-border/40 pl-2">
                    {book.chapters.map((ch) => {
                      const chOpen = expandedChapters.has(ch.id);
                      return (
                        <div key={ch.id} className="mb-0.5">
                          <div className="flex items-center gap-1 rounded-md px-1 py-0.5 text-xs">
                            <button
                              onClick={() => toggleChapter(ch.id)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {chOpen ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                            </button>
                            <button
                              onClick={() =>
                                setView({
                                  kind: "chapter",
                                  bookId: book.id,
                                  chapterId: ch.id,
                                })
                              }
                              className="flex flex-1 items-center gap-1.5 truncate text-left"
                            >
                              <FolderOpen className="h-3 w-3 text-amber-400/80" />
                              <span className="truncate">{ch.name}</span>
                            </button>
                          </div>
                          {chOpen && (
                            <div className="ml-4 border-l border-border/40 pl-2">
                              {ch.pages.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() =>
                                    setView({
                                      kind: "page",
                                      bookId: book.id,
                                      pageId: p.id,
                                    })
                                  }
                                  className={cn(
                                    "flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                                    view.kind === "page" &&
                                      view.pageId === p.id &&
                                      "bg-primary/10 text-primary",
                                  )}
                                >
                                  <FileText className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{p.title}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {book.loosePages.map((p) => (
                      <button
                        key={p.id}
                        onClick={() =>
                          setView({ kind: "page", bookId: book.id, pageId: p.id })
                        }
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                          view.kind === "page" &&
                            view.pageId === p.id &&
                            "bg-primary/10 text-primary",
                        )}
                      >
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className="truncate">{p.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* ─── Main pane ─── */}
      <main className="overflow-y-auto rounded-2xl border border-border/60 bg-card/20">
        {search.trim() ? (
          <SearchResults
            results={searchResults}
            query={search}
            onOpen={(bookId, pageId) =>
              setView({ kind: "page", bookId, pageId })
            }
            onClear={() => setSearch("")}
          />
        ) : view.kind === "home" ? (
          <HomeView
            books={books}
            shelves={shelves}
            recent={recent}
            onOpenBook={(id) => setView({ kind: "book", id })}
            onOpenShelf={(id) => setView({ kind: "shelf", id })}
            onOpenPage={(bookId, pageId) =>
              setView({ kind: "page", bookId, pageId })
            }
          />
        ) : view.kind === "shelves" ? (
          <ShelvesGrid
            shelves={shelves}
            books={books}
            onOpen={(id) => setView({ kind: "shelf", id })}
          />
        ) : view.kind === "shelf" ? (
          <ShelfDetail
            shelf={shelves.find((s) => s.id === view.id)!}
            books={books.filter((b) =>
              shelves
                .find((s) => s.id === view.id)
                ?.bookIds.includes(b.id),
            )}
            onBack={() => setView({ kind: "shelves" })}
            onOpenBook={(id) => setView({ kind: "book", id })}
          />
        ) : view.kind === "books" ? (
          <BooksGrid
            books={books}
            onOpen={(id) => setView({ kind: "book", id })}
          />
        ) : view.kind === "book" ? (
          <BookDetail
            book={books.find((b) => b.id === view.id)!}
            onBack={() => setView({ kind: "books" })}
            onOpenChapter={(chapterId) =>
              setView({ kind: "chapter", bookId: view.id, chapterId })
            }
            onOpenPage={(pageId) =>
              setView({ kind: "page", bookId: view.id, pageId })
            }
          />
        ) : view.kind === "chapter" ? (
          <ChapterDetail
            book={books.find((b) => b.id === view.bookId)!}
            chapter={
              books
                .find((b) => b.id === view.bookId)!
                .chapters.find((c) => c.id === view.chapterId)!
            }
            onBack={() => setView({ kind: "book", id: view.bookId })}
            onOpenPage={(pageId) =>
              setView({ kind: "page", bookId: view.bookId, pageId })
            }
          />
        ) : view.kind === "page" ? (
          <PageView
            book={books.find((b) => b.id === view.bookId)!}
            page={allPages.find((x) => x.page.id === view.pageId)!.page}
            chapter={allPages.find((x) => x.page.id === view.pageId)!.chapter}
            onBack={() => setView({ kind: "book", id: view.bookId })}
            onEdit={() =>
              setView({ kind: "edit", bookId: view.bookId, pageId: view.pageId })
            }
            onOpenTag={(tag) => setView({ kind: "tag", tag })}
          />
        ) : view.kind === "edit" ? (
          <PageEditor
            book={books.find((b) => b.id === view.bookId)!}
            page={allPages.find((x) => x.page.id === view.pageId)!.page}
            onClose={() =>
              setView({ kind: "page", bookId: view.bookId, pageId: view.pageId })
            }
            onSave={(patch) => {
              updatePage(view.bookId, view.pageId, patch);
              setView({
                kind: "page",
                bookId: view.bookId,
                pageId: view.pageId,
              });
            }}
          />
        ) : view.kind === "recent" ? (
          <RecentView
            recent={recent}
            onOpen={(bookId, pageId) =>
              setView({ kind: "page", bookId, pageId })
            }
          />
        ) : view.kind === "tag" ? (
          <TagView
            tag={view.tag}
            pages={allPages.filter((x) => x.page.tags.includes(view.tag))}
            onBack={() => setView({ kind: "home" })}
            onOpen={(bookId, pageId) =>
              setView({ kind: "page", bookId, pageId })
            }
          />
        ) : null}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sidebar helpers
// ─────────────────────────────────────────────────────────────
function SideLink({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: typeof Home;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
        active && "bg-primary/10 text-primary",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && (
        <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
          {badge}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Home (overview)
// ─────────────────────────────────────────────────────────────
function HomeView({
  books,
  shelves,
  recent,
  onOpenBook,
  onOpenShelf,
  onOpenPage,
}: {
  books: Book[];
  shelves: Shelf[];
  recent: { page: Page; book: Book; chapter: Chapter | null }[];
  onOpenBook: (id: string) => void;
  onOpenShelf: (id: string) => void;
  onOpenPage: (bookId: string, pageId: string) => void;
}) {
  const totalPages = books.reduce(
    (n, b) => n + b.loosePages.length + b.chapters.reduce((m, c) => m + c.pages.length, 0),
    0,
  );
  return (
    <div className="space-y-6 p-6">
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          <Library className="h-3 w-3" /> Knowledge Center
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {shelves.length} shelves · {books.length} books · {totalPages} pages
        </p>
      </div>

      <Section title="Shelves" actionLabel="View all" onAction={() => onOpenShelf(shelves[0]?.id)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shelves.map((s) => (
            <ShelfCard
              key={s.id}
              shelf={s}
              bookCount={s.bookIds.length}
              onClick={() => onOpenShelf(s.id)}
            />
          ))}
        </div>
      </Section>

      <Section title="Books" actionLabel="New book">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {books.map((b) => (
            <BookCard key={b.id} book={b} onClick={() => onOpenBook(b.id)} />
          ))}
        </div>
      </Section>

      <Section title="Recently viewed">
        <div className="space-y-1.5">
          {recent.length === 0 && (
            <EmptyHint message="Pages you open will appear here." />
          )}
          {recent.map(({ page, book, chapter }) => (
            <RecentRow
              key={page.id}
              page={page}
              book={book}
              chapter={chapter}
              onClick={() => onOpenPage(book.id, page.id)}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  actionLabel,
  onAction,
}: {
  title: string;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {actionLabel && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={onAction}
          >
            {actionLabel === "New book" ? <Plus className="mr-1 h-3 w-3" /> : null}
            {actionLabel}
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function ShelfCard({
  shelf,
  bookCount,
  onClick,
}: {
  shelf: Shelf;
  bookCount: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/40 p-4 text-left transition hover:border-primary/40 hover:bg-card/70"
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
          shelf.color,
        )}
      />
      <Library className="h-5 w-5 text-primary" />
      <div className="mt-3 text-sm font-semibold text-foreground">
        {shelf.name}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
        {shelf.description}
      </p>
      <div className="mt-3 text-[11px] text-muted-foreground">
        {bookCount} {bookCount === 1 ? "book" : "books"}
      </div>
    </button>
  );
}

function BookCard({ book, onClick }: { book: Book; onClick: () => void }) {
  const pageCount =
    book.loosePages.length +
    book.chapters.reduce((n, c) => n + c.pages.length, 0);
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/40 p-4 text-left transition hover:border-primary/40 hover:bg-card/70"
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-1 bg-gradient-to-b",
          book.color,
        )}
      />
      <div className="flex items-start justify-between">
        <BookIcon className="h-5 w-5 text-foreground/80" />
        <Badge variant="outline" className="h-5 text-[10px]">
          {pageCount} pages
        </Badge>
      </div>
      <div className="mt-3 text-sm font-semibold text-foreground">
        {book.name}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
        {book.description}
      </p>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3" /> updated {book.updatedAt}
      </div>
    </button>
  );
}

function RecentRow({
  page,
  book,
  chapter,
  onClick,
}: {
  page: Page;
  book: Book;
  chapter: Chapter | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border/40 bg-card/30 px-3 py-2 text-left hover:border-primary/40 hover:bg-card/60"
    >
      <FileText className="h-4 w-4 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {page.title}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {book.name}
          {chapter ? ` · ${chapter.name}` : ""} · {page.updatedAt}
        </div>
      </div>
      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[11px] text-muted-foreground">{page.views}</span>
    </button>
  );
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/40 bg-card/20 px-4 py-6 text-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Grid views
// ─────────────────────────────────────────────────────────────
function ShelvesGrid({
  shelves,
  books,
  onOpen,
}: {
  shelves: Shelf[];
  books: Book[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="space-y-4 p-6">
      <PageTitle title="Shelves" subtitle="Top-level groupings of related books." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shelves.map((s) => (
          <ShelfCard
            key={s.id}
            shelf={s}
            bookCount={s.bookIds.filter((id) => books.some((b) => b.id === id)).length}
            onClick={() => onOpen(s.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ShelfDetail({
  shelf,
  books,
  onBack,
  onOpenBook,
}: {
  shelf: Shelf;
  books: Book[];
  onBack: () => void;
  onOpenBook: (id: string) => void;
}) {
  return (
    <div className="space-y-4 p-6">
      <Breadcrumbs>
        <BreadcrumbLink onClick={onBack}>Shelves</BreadcrumbLink>
        <BreadcrumbCurrent>{shelf.name}</BreadcrumbCurrent>
      </Breadcrumbs>
      <header
        className={cn(
          "relative overflow-hidden rounded-xl border border-border/60 bg-card/40 p-5",
        )}
      >
        <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", shelf.color)} />
        <Library className="h-6 w-6 text-primary" />
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          {shelf.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{shelf.description}</p>
      </header>
      <Section title="Books in this shelf">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((b) => (
            <BookCard key={b.id} book={b} onClick={() => onOpenBook(b.id)} />
          ))}
        </div>
      </Section>
    </div>
  );
}

function BooksGrid({
  books,
  onOpen,
}: {
  books: Book[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="space-y-4 p-6">
      <PageTitle title="Books" subtitle="All books across every shelf." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {books.map((b) => (
          <BookCard key={b.id} book={b} onClick={() => onOpen(b.id)} />
        ))}
      </div>
    </div>
  );
}

function BookDetail({
  book,
  onBack,
  onOpenChapter,
  onOpenPage,
}: {
  book: Book;
  onBack: () => void;
  onOpenChapter: (id: string) => void;
  onOpenPage: (id: string) => void;
}) {
  return (
    <div className="space-y-4 p-6">
      <Breadcrumbs>
        <BreadcrumbLink onClick={onBack}>Books</BreadcrumbLink>
        <BreadcrumbCurrent>{book.name}</BreadcrumbCurrent>
      </Breadcrumbs>
      <header className="relative overflow-hidden rounded-xl border border-border/60 bg-card/40 p-5">
        <div className={cn("absolute inset-y-0 left-0 w-1 bg-gradient-to-b", book.color)} />
        <div className="flex items-start justify-between">
          <div>
            <BookIcon className="h-6 w-6 text-foreground/80" />
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              {book.name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {book.description}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline">
              <Plus className="mr-1 h-3 w-3" /> New chapter
            </Button>
            <Button size="sm">
              <Plus className="mr-1 h-3 w-3" /> New page
            </Button>
          </div>
        </div>
      </header>

      {book.chapters.map((ch) => (
        <div
          key={ch.id}
          className="rounded-xl border border-border/60 bg-card/30 p-4"
        >
          <button
            onClick={() => onOpenChapter(ch.id)}
            className="group flex w-full items-center gap-2 text-left"
          >
            <FolderOpen className="h-4 w-4 text-amber-400/80" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-foreground group-hover:text-primary">
                {ch.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {ch.description}
              </div>
            </div>
            <Badge variant="outline" className="h-5 text-[10px]">
              {ch.pages.length} pages
            </Badge>
          </button>
          <ul className="mt-3 space-y-1 border-t border-border/40 pt-3">
            {ch.pages.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => onOpenPage(p.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span className="flex-1 truncate">{p.title}</span>
                  <span className="text-[11px]">{p.updatedAt}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {book.loosePages.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/30 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pages
          </div>
          <ul className="space-y-1">
            {book.loosePages.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => onOpenPage(p.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span className="flex-1 truncate">{p.title}</span>
                  <span className="text-[11px]">{p.updatedAt}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {book.chapters.length === 0 && book.loosePages.length === 0 && (
        <EmptyHint message="This book is empty. Add a chapter or a page to get started." />
      )}
    </div>
  );
}

function ChapterDetail({
  book,
  chapter,
  onBack,
  onOpenPage,
}: {
  book: Book;
  chapter: Chapter;
  onBack: () => void;
  onOpenPage: (id: string) => void;
}) {
  return (
    <div className="space-y-4 p-6">
      <Breadcrumbs>
        <BreadcrumbLink onClick={onBack}>{book.name}</BreadcrumbLink>
        <BreadcrumbCurrent>{chapter.name}</BreadcrumbCurrent>
      </Breadcrumbs>
      <header className="rounded-xl border border-border/60 bg-card/40 p-5">
        <FolderOpen className="h-6 w-6 text-amber-400/80" />
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          {chapter.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {chapter.description}
        </p>
      </header>
      <div className="rounded-xl border border-border/60 bg-card/30 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pages
        </div>
        <ul className="space-y-1">
          {chapter.pages.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onOpenPage(p.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="flex-1 truncate">{p.title}</span>
                <span className="text-[11px]">{p.updatedAt}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Page view (with TOC + tabs)
// ─────────────────────────────────────────────────────────────
function PageView({
  book,
  chapter,
  page,
  onBack,
  onEdit,
  onOpenTag,
}: {
  book: Book;
  chapter: Chapter | null;
  page: Page;
  onBack: () => void;
  onEdit: () => void;
  onOpenTag: (tag: string) => void;
}) {
  const toc = useMemo(() => {
    const lines = page.content.split("\n");
    const headings: { level: number; text: string; id: string }[] = [];
    for (const l of lines) {
      const m = l.match(/^(#{1,3})\s+(.+)/);
      if (m) {
        const text = m[2].trim();
        headings.push({
          level: m[1].length,
          text,
          id: text.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        });
      }
    }
    return headings;
  }, [page.content]);

  return (
    <div className="grid grid-cols-[1fr_220px] gap-6 p-6">
      <article className="min-w-0 space-y-4">
        <Breadcrumbs>
          <BreadcrumbLink onClick={onBack}>{book.name}</BreadcrumbLink>
          {chapter && <BreadcrumbCurrent>{chapter.name}</BreadcrumbCurrent>}
          <BreadcrumbCurrent>{page.title}</BreadcrumbCurrent>
        </Breadcrumbs>

        <header className="rounded-xl border border-border/60 bg-card/40 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                {page.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>Last edited {page.updatedAt}</span>
                <span>by {page.updatedBy}</span>
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" /> {page.views} views
                </span>
              </div>
              {page.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {page.tags.map((t) => (
                    <button
                      key={t}
                      onClick={() => onOpenTag(t)}
                      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-white/[0.04] px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
                    >
                      <Tag className="h-2.5 w-2.5" /> {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={onEdit}>
                <Edit3 className="mr-1 h-3 w-3" /> Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Download className="mr-2 h-3.5 w-3.5" /> Export PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Download className="mr-2 h-3.5 w-3.5" /> Export Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Star className="mr-2 h-3.5 w-3.5" /> Favourite
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <Tabs defaultValue="content">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="content" className="text-xs">
              <FileText className="mr-1 h-3 w-3" /> Content
            </TabsTrigger>
            <TabsTrigger value="comments" className="text-xs">
              <MessageSquare className="mr-1 h-3 w-3" /> Comments
            </TabsTrigger>
            <TabsTrigger value="attachments" className="text-xs">
              <Paperclip className="mr-1 h-3 w-3" /> Attachments
            </TabsTrigger>
            <TabsTrigger value="revisions" className="text-xs">
              <History className="mr-1 h-3 w-3" /> Revisions
            </TabsTrigger>
          </TabsList>
          <TabsContent value="content">
            <div className="rounded-xl border border-border/60 bg-card/30 p-6">
              <div className="prose prose-invert prose-sm max-w-none">
                <Markdown source={page.content} />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="comments">
            <div className="rounded-xl border border-border/60 bg-card/30 p-6">
              <CommentsPanel />
            </div>
          </TabsContent>
          <TabsContent value="attachments">
            <div className="rounded-xl border border-border/60 bg-card/30 p-6">
              <AttachmentsPanel />
            </div>
          </TabsContent>
          <TabsContent value="revisions">
            <div className="rounded-xl border border-border/60 bg-card/30 p-6">
              <RevisionsPanel page={page} />
            </div>
          </TabsContent>
        </Tabs>
      </article>

      <aside className="space-y-3">
        <div className="rounded-xl border border-border/60 bg-card/30 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            On this page
          </div>
          {toc.length === 0 ? (
            <div className="text-xs text-muted-foreground">No headings.</div>
          ) : (
            <ul className="space-y-1 text-xs">
              {toc.map((h, i) => (
                <li
                  key={i}
                  style={{ paddingLeft: (h.level - 1) * 10 }}
                  className="truncate text-muted-foreground hover:text-foreground"
                >
                  {h.text}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-border/60 bg-card/30 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Info
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>Book: {book.name}</div>
            {chapter && <div>Chapter: {chapter.name}</div>}
            <div>Author: {page.updatedBy}</div>
            <div>Views: {page.views}</div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function CommentsPanel() {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Comment
          author="Sam Lee"
          when="2h ago"
          body="Updated the failover step — we now require a dry-run before leaving the site."
        />
        <Comment
          author="Riley Chen"
          when="yesterday"
          body="Great. Should we link to the post-incident checklist here too?"
        />
      </div>
      <div className="border-t border-border/40 pt-3">
        <Textarea
          placeholder="Add a comment…"
          rows={3}
          className="text-sm"
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm">Post comment</Button>
        </div>
      </div>
    </div>
  );
}
function Comment({ author, when, body }: { author: string; when: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div className="h-7 w-7 shrink-0 rounded-full bg-primary/20 text-center text-xs font-semibold leading-7 text-primary">
        {author[0]}
      </div>
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-foreground">{author}</span>
          <span className="text-[11px] text-muted-foreground">{when}</span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function AttachmentsPanel() {
  const files = [
    { name: "edge-baseline.yaml", size: "4.2 KB", when: "2h ago" },
    { name: "topology.png", size: "186 KB", when: "yesterday" },
  ];
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {files.length} files attached to this page.
        </div>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 h-3 w-3" /> Upload
        </Button>
      </div>
      <ul className="mt-3 space-y-1.5">
        {files.map((f) => (
          <li
            key={f.name}
            className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/40 px-3 py-2 text-sm"
          >
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 truncate text-foreground">{f.name}</span>
            <span className="text-[11px] text-muted-foreground">{f.size}</span>
            <span className="text-[11px] text-muted-foreground">{f.when}</span>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
              <Download className="h-3 w-3" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RevisionsPanel({ page }: { page: Page }) {
  const revs = [
    { n: 3, by: page.updatedBy, when: page.updatedAt, note: "Current" },
    { n: 2, by: "Sam Lee", when: "yesterday", note: "Tightened the verification table" },
    { n: 1, by: "Alex Morgan", when: "1 week ago", note: "Initial draft" },
  ];
  return (
    <ul className="space-y-1.5">
      {revs.map((r) => (
        <li
          key={r.n}
          className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/40 px-3 py-2 text-sm"
        >
          <Badge variant="outline" className="h-5 text-[10px]">
            rev {r.n}
          </Badge>
          <span className="flex-1 truncate text-foreground">{r.note}</span>
          <span className="text-[11px] text-muted-foreground">by {r.by}</span>
          <span className="text-[11px] text-muted-foreground">{r.when}</span>
          <Button size="sm" variant="ghost" className="h-6 text-xs">
            View
          </Button>
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────
// Editor (dual mode)
// ─────────────────────────────────────────────────────────────
function PageEditor({
  page,
  onClose,
  onSave,
}: {
  book: Book;
  page: Page;
  onClose: () => void;
  onSave: (patch: Partial<Page>) => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [mode, setMode] = useState<"markdown" | "wysiwyg">("markdown");
  const [tags, setTags] = useState(page.tags.join(", "));
  const dirty = title !== page.title || content !== page.content || tags !== page.tags.join(", ");
  const editorRef = useRef<HTMLDivElement | null>(null);

  // WYSIWYG → sync contentEditable HTML back into state.
  useEffect(() => {
    if (mode === "wysiwyg" && editorRef.current) {
      editorRef.current.innerHTML = renderSimpleHtml(content);
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function exec(cmd: string, arg?: string) {
    document.execCommand(cmd, false, arg);
    if (editorRef.current) {
      // Re-extract a simplified markdown-ish version (UI mock).
      setContent(htmlToText(editorRef.current.innerHTML));
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          <ArrowLeft className="mr-1 h-3 w-3" /> Cancel
        </Button>
        <Badge variant="outline" className="h-5">
          Editing
        </Badge>
        {dirty && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
            Unsaved changes
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border/60 p-0.5">
            <button
              onClick={() => setMode("markdown")}
              className={cn(
                "rounded px-2 py-1 text-xs",
                mode === "markdown"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              <Code2 className="mr-1 inline h-3 w-3" /> Markdown
            </button>
            <button
              onClick={() => setMode("wysiwyg")}
              className={cn(
                "rounded px-2 py-1 text-xs",
                mode === "wysiwyg"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              <Type className="mr-1 inline h-3 w-3" /> WYSIWYG
            </button>
          </div>
          <Button
            size="sm"
            onClick={() =>
              onSave({
                title,
                content,
                tags: tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
                updatedAt: "just now",
              })
            }
            disabled={!dirty}
          >
            <Save className="mr-1 h-3 w-3" /> Save
          </Button>
        </div>
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Page title"
        className="h-11 text-lg font-semibold"
      />

      <Input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="Tags (comma-separated)"
        className="h-8 text-xs"
      />

      {mode === "wysiwyg" ? (
        <>
          <div className="flex flex-wrap gap-1 rounded-md border border-border/60 bg-card/30 p-1">
            <ToolbarBtn label="B" bold onClick={() => exec("bold")} />
            <ToolbarBtn label="I" italic onClick={() => exec("italic")} />
            <ToolbarBtn label="U" underline onClick={() => exec("underline")} />
            <Sep />
            <ToolbarBtn label="H1" onClick={() => exec("formatBlock", "<h1>")} />
            <ToolbarBtn label="H2" onClick={() => exec("formatBlock", "<h2>")} />
            <ToolbarBtn label="H3" onClick={() => exec("formatBlock", "<h3>")} />
            <Sep />
            <ToolbarBtn label="• List" onClick={() => exec("insertUnorderedList")} />
            <ToolbarBtn label="1. List" onClick={() => exec("insertOrderedList")} />
            <Sep />
            <ToolbarBtn label="Quote" onClick={() => exec("formatBlock", "<blockquote>")} />
            <ToolbarBtn label="Code" onClick={() => exec("formatBlock", "<pre>")} />
          </div>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) =>
              setContent(htmlToText((e.target as HTMLDivElement).innerHTML))
            }
            className="prose prose-invert prose-sm min-h-[400px] flex-1 max-w-none overflow-auto rounded-md border border-border/60 bg-card/30 p-4 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </>
      ) : (
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your Markdown here…"
          className="flex-1 min-h-[400px] font-mono text-sm"
        />
      )}
    </div>
  );
}

function ToolbarBtn({
  label,
  onClick,
  bold,
  italic,
  underline,
}: {
  label: string;
  onClick: () => void;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "rounded px-2 py-1 text-xs text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
        bold && "font-bold",
        italic && "italic",
        underline && "underline",
      )}
    >
      {label}
    </button>
  );
}
function Sep() {
  return <div className="mx-0.5 w-px self-stretch bg-border/40" />;
}

function renderSimpleHtml(md: string) {
  // Minimal markdown → HTML for the WYSIWYG round-trip preview.
  let h = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  h = h
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n\n/g, "</p><p>");
  return `<p>${h}</p>`;
}
function htmlToText(html: string) {
  // Very small HTML → markdown-ish reducer for the mock editor.
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// ─────────────────────────────────────────────────────────────
// Recents + tags
// ─────────────────────────────────────────────────────────────
function RecentView({
  recent,
  onOpen,
}: {
  recent: { page: Page; book: Book; chapter: Chapter | null }[];
  onOpen: (bookId: string, pageId: string) => void;
}) {
  return (
    <div className="space-y-4 p-6">
      <PageTitle title="Recently viewed" subtitle="Pages you've opened recently." />
      <div className="space-y-1.5">
        {recent.length === 0 && (
          <EmptyHint message="No recent pages yet." />
        )}
        {recent.map(({ page, book, chapter }) => (
          <RecentRow
            key={page.id}
            page={page}
            book={book}
            chapter={chapter}
            onClick={() => onOpen(book.id, page.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TagView({
  tag,
  pages,
  onBack,
  onOpen,
}: {
  tag: string;
  pages: { page: Page; book: Book; chapter: Chapter | null }[];
  onBack: () => void;
  onOpen: (bookId: string, pageId: string) => void;
}) {
  return (
    <div className="space-y-4 p-6">
      <Breadcrumbs>
        <BreadcrumbLink onClick={onBack}>Home</BreadcrumbLink>
        <BreadcrumbCurrent>Tag · {tag}</BreadcrumbCurrent>
      </Breadcrumbs>
      <PageTitle title={`#${tag}`} subtitle={`${pages.length} pages tagged.`} />
      <div className="space-y-1.5">
        {pages.map(({ page, book, chapter }) => (
          <RecentRow
            key={page.id}
            page={page}
            book={book}
            chapter={chapter}
            onClick={() => onOpen(book.id, page.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SearchResults({
  results,
  query,
  onOpen,
  onClear,
}: {
  results: { page: Page; book: Book; chapter: Chapter | null }[];
  query: string;
  onOpen: (bookId: string, pageId: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">
          {results.length} result{results.length === 1 ? "" : "s"} for{" "}
          <span className="font-medium text-foreground">"{query}"</span>
        </div>
        <Button size="sm" variant="ghost" onClick={onClear} className="ml-auto h-7 text-xs">
          <X className="mr-1 h-3 w-3" /> Clear
        </Button>
      </div>
      <div className="space-y-1.5">
        {results.length === 0 && (
          <EmptyHint message="No pages match your search." />
        )}
        {results.map(({ page, book, chapter }) => (
          <RecentRow
            key={page.id}
            page={page}
            book={book}
            chapter={chapter}
            onClick={() => onOpen(book.id, page.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Misc UI
// ─────────────────────────────────────────────────────────────
function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
function Breadcrumbs({ children }: { children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
          {c}
        </span>
      ))}
    </nav>
  );
}
function BreadcrumbLink({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="hover:text-foreground hover:underline">
      {children}
    </button>
  );
}
function BreadcrumbCurrent({ children }: { children: React.ReactNode }) {
  return <span className="text-foreground">{children}</span>;
}
