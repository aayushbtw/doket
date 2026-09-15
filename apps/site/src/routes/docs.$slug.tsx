import { createFileRoute } from "@tanstack/react-router";

import { Article } from "#/components/article";
import { PageNav } from "#/components/page-nav";
import { getDoc } from "#/lib/docs";

// Not sorted: `loader` must come before `head` and `component`, which infer `loaderData` from it.
export const Route = createFileRoute("/docs/$slug")({
  loader: ({ params }) => getDoc({ data: params.slug }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.metadata.title ?? "Docs"} · tomekit` }],
  }),
  component: Doc,
});

function Doc() {
  const { body, metadata, next, previous } = Route.useLoaderData();

  return (
    <Article
      body={body}
      description={metadata.description}
      headings={metadata.headings}
      title={metadata.title}
    >
      <PageNav next={next} previous={previous} />
    </Article>
  );
}
