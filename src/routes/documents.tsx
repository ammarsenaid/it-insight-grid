import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { KnowledgeWorkspace } from "@/components/knowledge/KnowledgeWorkspace";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Knowledge Base · IT Knowledge Center" },
      {
        name: "description",
        content:
          "Author and browse structured IT knowledge — spaces, books, chapters and pages with review, versions and relations.",
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
        description="Structured internal documentation — spaces, books, chapters and pages."
      />
      <KnowledgeWorkspace />
    </div>
  );
}
