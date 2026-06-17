import { createFileRoute } from "@tanstack/react-router";
import { TicketWizard } from "@/components/service-desk/TicketWizard";

export const Route = createFileRoute("/tickets/new")({
  head: () => ({ meta: [{ title: "Create Ticket · IT Knowledge Center" }] }),
  component: NewTicketPage,
});

function NewTicketPage() {
  return <TicketWizard mode="ticket" backTo="/tickets" />;
}
