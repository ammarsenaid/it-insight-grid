import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/common/ComingSoon";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users · IT Knowledge Center" }] }),
  component: () => <ComingSoon title="Users" description="Directory of internal users, status, team and role assignments." batch="Batch 7" />,
});
