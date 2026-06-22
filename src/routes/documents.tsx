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
        content: "Books, chapters and pages — a backend-powered knowledge base for your team.",
      },
    ],
  }),
  errorComponent: ({ reset }) => (
    <div
      className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm"
      role="alert"
    >
      <h1 className="font-semibold text-destructive">Could not load Documents</h1>
      <p className="mt-1 text-muted-foreground">
        The knowledge center could not be opened. Retry, or contact an administrator if the problem
        continues.
      </p>
      <button
        className="mt-3 font-medium text-primary underline underline-offset-4"
        onClick={() => reset()}
      >
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-sm text-muted-foreground">Page not found.</div>,
  component: DocumentsPage,
});

function DocumentsPage() {
  return (
    <div>
      <KnowledgeBackendWorkspace />
    </div>
  );
}
