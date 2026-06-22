import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeCenterWorkspace } from "@/components/knowledge/KnowledgeCenterWorkspace";

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
  errorComponent: ({ error, reset }) => (
    <div className="p-8 text-sm text-destructive">
      Could not load Documents: {error.message}{" "}
      <button className="underline" onClick={() => reset()}>
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
      <KnowledgeCenterWorkspace />
    </div>
  );
}
