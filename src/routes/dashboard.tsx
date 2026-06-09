import { createFileRoute } from "@tanstack/react-router";
import { Route as IndexRoute } from "./index";

const IndexComponent = IndexRoute.options.component!;

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · IT Knowledge Center" },
      { name: "description", content: "Central overview of documentation, assets, IP addresses, tasks, notes, and local system activity." },
    ],
  }),
  component: IndexComponent,
});
