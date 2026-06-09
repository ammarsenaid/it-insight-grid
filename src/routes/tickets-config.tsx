import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/common/ComingSoon";

export const Route = createFileRoute("/tickets-config")({
  head: () => ({ meta: [{ title: "Ticket Configuration · IT Knowledge Center" }] }),
  component: () => <ComingSoon title="Ticket Configuration" description="Statuses, priorities, categories, SLA policies, routing rules." batch="Batch 4" />,
});
