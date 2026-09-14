import { spawnSync } from "node:child_process";
import path from "node:path";

import { createServer } from "vite";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { tomekit } from "../src/vite";
import { createProject, SOURCE } from "./project";

const TSC = path.join(import.meta.dirname, "..", "node_modules", ".bin", "tsc");

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
});

// Imports the source, since "tomekit" would resolve to dist, which may not be built yet.
const config = `
import { z } from "zod";
import { defineCollection, defineConfig } from ${JSON.stringify(SOURCE.replace(/\.ts$/u, ""))};

export default defineConfig({
  collections: {
    collection: defineCollection({
      directory: "content/pages",
      schema: z.object({ order: z.number() }),
    }),
    index: defineCollection({
      directory: "content/pages",
      schema: z.object({ order: z.number() }),
    }),
    posts: defineCollection({
      directory: "content/posts",
      schema: z.object({ title: z.string() }),
    }),
  },
});
`;

// The generated project resolves "tomekit" to this repo's source, the way an
// installed package would resolve to its own types.
const tsconfig = JSON.stringify({
  compilerOptions: {
    module: "ESNext",
    moduleResolution: "bundler",
    noEmit: true,
    paths: {
      tomekit: [SOURCE],
      "tomekit/content*": ["./.tomekit/content*"],
    },
    skipLibCheck: true,
    strict: true,
    target: "ES2023",
    types: [],
  },
  include: ["*.ts", ".tomekit/**/*.ts"],
});

async function typecheck(usage: string) {
  const project = await createProject({
    "content/pages/home.md": "---\norder: 1\n---\n",
    "content/posts/hello.md": "---\ntitle: Hello\n---\n",
    "tomekit.config.ts": config,
    "tsconfig.json": tsconfig,
    "usage.ts": usage,
  });

  ({ cleanup } = project);

  const server = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [tomekit()],
    root: project.root,
    server: { hmr: false, middlewareMode: true },
  });

  await server.pluginContainer.buildStart({});
  await server.close();

  const result = spawnSync(TSC, ["-p", project.root], { encoding: "utf-8" });

  return result.status === 0 ? "" : result.stdout;
}

describe("generated types", () => {
  it("type collections, documents and slugs through the tsconfig alias", async () => {
    const output = await typecheck(`
import { collections, type CollectionName, type DocumentOf, type SlugOf } from "tomekit/content";

const posts = collections.get("posts");
const post: DocumentOf<"posts"> = posts.get("hello");
const title: string = post.metadata.title;
const body: string = post.body;
const slug: SlugOf<"posts"> = post.slug;
const fromRoute: string = "anything";
const maybe: DocumentOf<"posts"> | undefined = posts.get(fromRoute);
const checked: string = posts.has(fromRoute) ? posts.get(fromRoute).metadata.title : "";
const slugs: readonly SlugOf<"posts">[] = posts.slugs();
const order: number = collections.get("index").get("home").metadata.order;
const dynamic: readonly DocumentOf[] = collections.get(fromRoute)?.documents() ?? [];
const narrowed: readonly DocumentOf[] = collections.has(fromRoute) ? collections.get(fromRoute).documents() : [];
const names: readonly CollectionName[] = collections.names();
const everything: readonly DocumentOf[] = collections.names().flatMap((name) => collections.get(name).documents());

export { body, checked, dynamic, everything, maybe, names, narrowed, order, slug, slugs, title };
`);

    expect(output).toBe("");
  }, 30_000);

  it("reject fields, slugs and names that do not exist, and unchecked lookups", async () => {
    const output = await typecheck(`
import { collections, type CollectionName, type DocumentOf, type SlugOf } from "tomekit/content";

collections.get("posts").documents()[0]?.metadata.author;
const slug: SlugOf<"posts"> = "missing";
const name: CollectionName = "drafts";
type Archive = DocumentOf<"archive">;
const fromRoute: string = "anything";
const unchecked: string = collections.get("posts").get(fromRoute).metadata.title;

export { name, slug, unchecked, type Archive };
`);

    expect(output).toContain("author");
    expect(output).toContain('"missing"');
    expect(output).toContain('"drafts"');
    expect(output).toContain('"archive"');
    expect(output).toContain("possibly 'undefined'");
  }, 30_000);

  it("return a document or undefined when the collection name is a union", async () => {
    const output = await typecheck(`
import { collections, type CollectionName, type DocumentOf } from "tomekit/content";

function lookup(name: CollectionName) {
  const known: DocumentOf = collections.get(name).get("hello");
  const maybe: DocumentOf | undefined = collections.get(name).get("hello");
  return [known, maybe];
}

export { lookup };
`);

    expect(output).toMatch(/usage\.ts\(5,9\).*'undefined'/su);
    expect(output).not.toContain("usage.ts(6,");
  }, 30_000);
});
