import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/recycle-bin")({
  beforeLoad: () => {
    throw redirect({ to: "/trash" });
  },
});
