import { createFileRoute } from "@tanstack/react-router";

import { DocPage } from "#/components/doc-page";
import { getDoc } from "#/lib/docs";
import { homeSlug } from "#/lib/links";

export const Route = createFileRoute("/_docs/")({
  loader: () => getDoc({ data: homeSlug }),
  component: Home,
});

function Home() {
  return <DocPage doc={Route.useLoaderData()} />;
}
