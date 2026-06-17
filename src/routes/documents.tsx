import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/documents")({
  validateSearch: (s: Record<string, unknown>) => ({
    article: typeof s.article === "string" ? s.article : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Knowledge Base · IT Knowledge Center" },
      {
        name: "description",
        content: "Knowledge base.",
      },
    ],
  }),
  component: KnowledgeBasePage,
});

function KnowledgeBasePage() {
  return <div />;
}
