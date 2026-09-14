import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { collections } from "tomekit/content";

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
    <main>
      <h1>{metadata.title}</h1>
      <p>{metadata.description}</p>
      <article>{body}</article>
    </main>
  );
}
