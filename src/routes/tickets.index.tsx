import { createFileRoute } from "@tanstack/react-router";

import { TicketsPage } from "./tickets";

export const Route = createFileRoute("/tickets/")({
  head: () => ({ meta: [{ title: "Tickets · IT Knowledge Center" }] }),
  component: TicketsPage,
});