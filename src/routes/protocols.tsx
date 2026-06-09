import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/protocols")({
  head: () => ({ meta: [{ title: "Protocols · IT Knowledge Center" }] }),
  component: () => <Outlet />,
});
