import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/common/ComingSoon";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "Audit Log · IT Knowledge Center" }] }),
  component: () => <ComingSoon title="Audit Log" description="Immutable record of administrative and operational events." batch="Batch 8" />,
});
