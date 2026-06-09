import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/common/ComingSoon";

export const Route = createFileRoute("/service-catalog")({
  head: () => ({ meta: [{ title: "Service Catalog · IT Knowledge Center" }] }),
  component: () => <ComingSoon title="Service Catalog" description="Browse and request standardized IT services." batch="Batch 4" />,
});
