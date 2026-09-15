import { createFileRoute } from "@tanstack/react-router";

import { Article } from "#/components/article";
import { getReference } from "#/lib/docs";

// Not sorted: `loader` must come before `head` and `component`, which infer `loaderData` from it.
export const Route = createFileRoute("/docs/$slug_/$kind/$name")({
  loader: ({ params }) => getReference({ data: params }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.metadata.name ?? "Reference"} · tomekit` }],
  }),
  component: Reference,
});

function Reference() {
  const { body, metadata } = Route.useLoaderData();
  const call = metadata.kind === "Function" ? "()" : "";

  return (
    <Article
      body={body}
      description={undefined}
      headings={metadata.headings}
      title={`${metadata.kind}: ${metadata.name}${call}`}
    />
  );
}
