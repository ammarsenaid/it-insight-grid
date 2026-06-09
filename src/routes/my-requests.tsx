import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/common/ComingSoon";

export const Route = createFileRoute("/my-requests")({
  head: () => ({ meta: [{ title: "My Requests · IT Knowledge Center" }] }),
  component: () => <ComingSoon title="My Requests" description="End-user view of submitted tickets and their statuses." batch="Batch 4" />,
});
