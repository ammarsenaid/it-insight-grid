import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { KnowledgeBackendWorkspace } from "@/components/knowledge/KnowledgeBackendWorkspace";
import { KnowledgePreviewWorkspace } from "@/components/knowledge/KnowledgePreviewWorkspace";
import { isLovablePreviewHost } from "@/preview/previewBypass";

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
  // LOVABLE PREVIEW ONLY — render a polished sample workspace instead of the
  // backend-bound one. Activates strictly on Lovable preview hostnames.
  // NEVER enable this path in production.
  if (isLovablePreviewHost()) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-[12px] text-primary">
          <span className="font-medium">
            Design preview · sample data only — backend not connected
          </span>
          <span className="text-[11px] uppercase tracking-wider text-primary/80">
            Lovable Preview
          </span>
        </div>
        <KnowledgePreviewWorkspace />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        description="Books, chapters and pages for your IT documentation."
      />
      <KnowledgeBackendWorkspace />
    </div>
  );
}
