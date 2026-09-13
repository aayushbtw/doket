import path from "node:path";

import { createServer } from "vite";
import type { ViteDevServer } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { doket } from "../src/vite";
import { createProject, SOURCE } from "./project";

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

interface Posts {
  collections: {
    posts: {
      all: () => { date: Date; title: string }[];
      get: (slug: string) => { title: string } | undefined;
    };
  };
}

let server: ViteDevServer | undefined;
let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await server?.close();
  await cleanup?.();
});

async function start(files: Record<string, string>) {
  const project = await createProject({ "doket.config.ts": config, ...files });
  ({ cleanup } = project);
  server = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [doket()],
    root: project.root,
    server: { hmr: false, middlewareMode: true },
  });
  return { project, server };
}

describe("doket()", () => {
  it("serves every collection from virtual:doket", async () => {
    const { server: dev } = await start({
      "content/posts/hello.md": "---\ntitle: Hello\ndate: 2026-03-27\n---\n",
    });

    const { collections } = (await dev.ssrLoadModule("virtual:doket")) as Posts;

    expect(collections.posts.all()).toHaveLength(1);
    expect(collections.posts.get("hello")?.title).toBe("Hello");
    expect(collections.posts.all()[0]?.date).toBeInstanceOf(Date);
    expect(collections.posts.get("missing")).toBeUndefined();
  });

  it("picks up a new file after a change in the collection directory", async () => {
    const { project, server: dev } = await start({
      "content/posts/hello.md": "---\ntitle: Hello\ndate: 2026-03-27\n---\n",
    });
    await dev.ssrLoadModule("virtual:doket");

    await project.write({
      "content/posts/later.md": "---\ntitle: Later\ndate: 2026-04-01\n---\n",
    });
    dev.watcher.emit(
      "all",
      "add",
      path.join(project.root, "content/posts/later.md")
    );

    const { collections } = (await dev.ssrLoadModule("virtual:doket")) as Posts;
    expect(collections.posts.get("later")?.title).toBe("Later");
  });
});
