import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeBackendWorkspace } from "@/components/knowledge/KnowledgeBackendWorkspace";

export const Route = createFileRoute("/documents")({
  validateSearch: (s: Record<string, unknown>) => ({
    article: typeof s.article === "string" ? s.article : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Knowledge Base · IT Knowledge Center" },
      {
        name: "description",
        content:
          "Browse the team knowledge base — books, chapters and pages served live from the backend.",
      },
    ],
  }),
  component: KnowledgeBasePage,
});

function KnowledgeBasePage() {
  return (
    <div className="-mt-2">
      <KnowledgeBackendWorkspace />
    </div>
  );
}
