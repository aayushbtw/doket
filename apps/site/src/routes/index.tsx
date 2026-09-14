import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="mx-auto my-16 max-w-2xl px-4">
      <h1 className="text-3xl font-semibold">tomekit</h1>
      <p className="mt-2 text-neutral-500">
        Fully typed content collections for Markdown.
      </p>
      <Link
        className="mt-6 inline-block underline"
        params={{ slug: "introduction" }}
        to="/docs/$slug"
      >
        Read the docs
      </Link>
    </main>
  );
}
