import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/common/ComingSoon";

export const Route = createFileRoute("/admin/teams")({
  head: () => ({ meta: [{ title: "Teams · IT Knowledge Center" }] }),
  component: () => <ComingSoon title="Teams" description="Service desk and operations teams, membership and routing." batch="Batch 7" />,
});
