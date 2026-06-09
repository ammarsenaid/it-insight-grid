import { createFileRoute } from "@tanstack/react-router";
import { Route as IndexRoute } from "./index";

export const Route = createFileRoute("/dashboard")({
  head: IndexRoute.options.head,
  component: IndexRoute.options.component!,
});
