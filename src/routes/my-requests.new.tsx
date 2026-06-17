import { createFileRoute } from "@tanstack/react-router";
import { TicketWizard } from "@/components/service-desk/TicketWizard";

export const Route = createFileRoute("/my-requests/new")({
  head: () => ({ meta: [{ title: "New Request · IT Knowledge Center" }] }),
  component: NewRequestPage,
});

function NewRequestPage() {
  return <TicketWizard mode="request" backTo="/my-requests" />;
}
