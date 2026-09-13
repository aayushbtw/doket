import { readFile } from "node:fs/promises";
import path from "node:path";

import { createServer } from "vite";
import type { ViteDevServer } from "vite";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { tomekit } from "../src/vite";
import { createProject, QUERY, SOURCE } from "./project";

const config = `
import { z } from "zod";
import { defineCollection, defineConfig } from ${JSON.stringify(SOURCE)};

const posts = defineCollection({
  directory: "content/posts",
  include: "*.md",
  name: "posts",
  schema: z.object({ date: z.coerce.date(), title: z.string() }),
  transform: (document) => ({ date: document.date, title: document.title }),
});

export default defineConfig({ collections: [posts] });
`;

interface Post {
  date: Date;
  title: string;
}

interface Posts {
  findMany: (args?: { orderBy?: { date?: "asc" | "desc" } }) => Post[];
  findUnique: (args: { slug: string }) => Post | undefined;
}

function hasContent(module: object): module is { content: { posts: Posts } } {
  return "content" in module;
}

// Through a file that imports it, the way an app would, not by loading the id directly.
async function loadPosts(dev: ViteDevServer) {
  const module = await dev.ssrLoadModule("/src/read.ts");
  if (!hasContent(module)) {
    throw new Error("tomekit/content has no content export");
  }
  return module.content.posts;
}

let server: ViteDevServer | undefined;
let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await server?.close();
  await cleanup?.();
});

async function start(files: Record<string, string>) {
  const project = await createProject({
    "src/read.ts": 'export { content } from "tomekit/content";\n',
    "tomekit.config.ts": config,
    ...files,
  });
  ({ cleanup } = project);
  server = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [tomekit()],
    // The generated module imports the query runtime the way an installed package would.
    resolve: { alias: { "tomekit/query": QUERY } },
    root: project.root,
    server: { hmr: false, middlewareMode: true },
  });
  return { project, server };
}

describe("tomekit()", () => {
  it("serves every collection through the query API", async () => {
    const { server: dev } = await start({
      "content/posts/hello.md": "---\ntitle: Hello\ndate: 2026-03-27\n---\n",
      "content/posts/later.md": "---\ntitle: Later\ndate: 2026-04-01\n---\n",
    });

    const posts = await loadPosts(dev);

    expect(
      posts.findMany({ orderBy: { date: "desc" } }).map((post) => post.title)
    ).toStrictEqual(["Later", "Hello"]);
    expect(posts.findUnique({ slug: "hello" })?.date).toBeInstanceOf(Date);
  });

  it("picks up a new file after a change in the collection directory", async () => {
    const { project, server: dev } = await start({
      "content/posts/hello.md": "---\ntitle: Hello\ndate: 2026-03-27\n---\n",
    });
    await loadPosts(dev);

    await project.write({
      "content/posts/later.md": "---\ntitle: Later\ndate: 2026-04-01\n---\n",
    });
    dev.watcher.emit(
      "all",
      "add",
      path.join(project.root, "content/posts/later.md")
    );

    const posts = await loadPosts(dev);
    expect(posts.findUnique({ slug: "later" })?.title).toBe("Later");
  });
});

describe("tomekit() types", () => {
  it("writes the declaration that types tomekit/content", async () => {
    const { project } = await start({});

    const written = await readFile(
      path.join(project.root, "tomekit-env.d.ts"),
      "utf-8"
    );
    expect(written).toContain('import type config from "./tomekit.config";');
  });
});

describe("tomekit/content without the plugin", () => {
  it("fails with a message that names the missing plugin", async () => {
    await expect(import("../src/content")).rejects.toThrow(
      "tomekit() Vite plugin"
    );
  });
});
