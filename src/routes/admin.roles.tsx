import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/common/ComingSoon";

export const Route = createFileRoute("/admin/roles")({
  head: () => ({ meta: [{ title: "Roles · IT Knowledge Center" }] }),
  component: () => <ComingSoon title="Roles" description="Role definitions and permission matrix." batch="Batch 7" />,
});
