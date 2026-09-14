import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main>
      <h1>tomekit</h1>
      <p>Fully typed content collections for Markdown.</p>
      <Link params={{ slug: "introduction" }} to="/docs/$slug">
        Read the docs
      </Link>
    </main>
  );
}
