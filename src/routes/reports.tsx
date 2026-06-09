import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/common/ComingSoon";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports · IT Knowledge Center" }] }),
  component: () => <ComingSoon title="Reports" description="Operational metrics, SLA performance, knowledge coverage." batch="Batch 8" />,
});
