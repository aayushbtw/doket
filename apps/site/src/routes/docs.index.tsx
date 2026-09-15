import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/docs/")({
  beforeLoad: () => {
    throw redirect({ params: { slug: "overview" }, to: "/docs/$slug" });
  },
});
