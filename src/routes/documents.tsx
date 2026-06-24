import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeBackendWorkspace } from "@/components/knowledge/KnowledgeBackendWorkspace";

export const Route = createFileRoute("/documents")({
  validateSearch: (s: Record<string, unknown>) => ({
    article: typeof s.article === "string" ? s.article : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Documents · IT Knowledge Center" },
      {
        name: "description",
        content:
          "Books, chapters and pages — a backend-powered knowledge base for your team.",
      },
    ],
  }),
  errorComponent: ({ reset }) => (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm">
      <div className="font-medium text-destructive">
        The knowledge center could not be opened.
      </div>
      <p className="mt-1 max-w-2xl text-muted-foreground">
        Refresh the page or try again. If the problem continues, contact an administrator.
      </p>
      <button
        className="mt-3 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background/60"
        onClick={() => reset()}
      >
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-8 text-sm text-muted-foreground">Page not found.</div>
  ),
  component: DocumentsPage,
});

function DocumentsPage() {
  return (
    <div className="-mt-2">
      <KnowledgeBackendWorkspace />
    </div>
  );
}
