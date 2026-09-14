import { Markdown } from "@tanstack/markdown/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { collections } from "tomekit/content";

import { highlightCode } from "#/lib/highlight";

// Content is read inside a server function so it never ships in the client bundle.
const getDoc = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(({ data: slug }) => {
    const doc = collections.get("docs").get(slug);

    if (!doc) {
      throw notFound();
    }

    return doc;
  });

// Not sorted: `loader` must come before `head` and `component`, which infer `loaderData` from it.
export const Route = createFileRoute("/docs/$slug")({
  loader: ({ params }) => getDoc({ data: params.slug }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.metadata.title ?? "Docs"} · tomekit` }],
  }),
  component: Doc,
});

function Doc() {
  const { body, metadata } = Route.useLoaderData();

  return (
    <main className="mx-auto my-16 max-w-2xl px-4">
      <h1 className="text-3xl font-semibold">{metadata.title}</h1>
      <p className="mt-2 text-neutral-500">{metadata.description}</p>
      <article className="mt-8">
        <Markdown highlighter={highlightCode}>{body}</Markdown>
      </article>
    </main>
  );
}
