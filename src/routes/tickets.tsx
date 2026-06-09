import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/common/ComingSoon";

export const Route = createFileRoute("/tickets")({
  head: () => ({ meta: [{ title: "Tickets · IT Knowledge Center" }] }),
  component: () => <ComingSoon title="Tickets" description="Service desk queue, ticket detail cockpit, SLA timers, internal notes." batch="Batch 3" />,
});
