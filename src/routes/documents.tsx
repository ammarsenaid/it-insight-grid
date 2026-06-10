import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
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
          "Browse the team knowledge base — spaces, categories and articles served live from the backend.",
      },
    ],
  }),
  component: KnowledgeBasePage,
});

function KnowledgeBasePage() {
  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        description="Spaces, categories and articles for your IT documentation."
      />

      <KnowledgeBackendWorkspace />
    </div>
  );
}
