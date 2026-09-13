import { spawnSync } from "node:child_process";
import path from "node:path";

import { createServer } from "vite";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { tomekit } from "../src/vite";
import { createProject, QUERY, SOURCE } from "./project";

const TSC = path.join(import.meta.dirname, "..", "node_modules", ".bin", "tsc");

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});

const config = `
import { z } from "zod";
import { defineCollection, defineConfig } from "tomekit";

export default defineConfig({
  collections: {
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
    resolve: { alias: { "tomekit/query": QUERY } },
    root: project.root,
    server: { hmr: false, middlewareMode: true },
  });
  await server.pluginContainer.buildStart({});
  await server.close();

  const result = spawnSync(TSC, ["-p", project.root], { encoding: "utf-8" });
  return result.status === 0 ? "" : result.stdout;
}

describe("generated types", () => {
  it("type content, named types and slugs through the tsconfig alias", async () => {
    const output = await typecheck(`
import { content, type AnyDocument, type Posts, type PostsSlug } from "tomekit/content";
import posts from "tomekit/content/posts";

const post: Posts | undefined = content.posts.get("hello");
const title: string | undefined = post?.title;
const slug: PostsSlug | undefined = post?.slug;
const fromRoute: string = "anything";
posts.get(fromRoute);
const slugs: readonly PostsSlug[] = posts.slugs;
const everything: AnyDocument[] = Object.values(content).flatMap((collection): readonly AnyDocument[] => collection.all);

export { everything, slug, slugs, title };
`);

    expect(output).toBe("");
  }, 30_000);

  it("reject fields and slugs that do not exist", async () => {
    const output = await typecheck(`
import { content, type PostsSlug } from "tomekit/content";

content.posts.all[0]?.author;
const slug: PostsSlug = "missing";

export { slug };
`);

    expect(output).toContain("author");
    expect(output).toContain('"missing"');
  }, 30_000);
});
