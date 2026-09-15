import { readFile } from "node:fs/promises";
import path from "node:path";

import { build, createLogger, createServer } from "vite";
import type { HotPayload, ServerOptions, ViteDevServer } from "vite";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { tomekit } from "../src/vite";
import { createProject, SOURCE } from "./project";

// Counts transform runs on `globalThis`, which the config shares with the test
// even though Vite imports it separately.
const config = `
import { z } from "zod";
import { defineCollection, defineConfig, directory } from ${JSON.stringify(SOURCE)};

export default defineConfig({
  collections: {
    posts: defineCollection({
      loader: directory("content/posts"),
      schema: z.object({ date: z.coerce.date(), title: z.string() }),
      transform: (source) => {
        globalThis.tomekitRuns = (globalThis.tomekitRuns ?? 0) + 1;
        return {
          metadata: { date: source.metadata.date, title: source.metadata.title },
        };
      },
    }),
  },
});
`;

// A collection read from a JSON file outside any content folder, the way a loader written in the config would.
const loaderConfig = `
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { defineConfig } from ${JSON.stringify(SOURCE)};

export default defineConfig({
  collections: {
    pages: {
      loader: {
        load: async ({ root }) => ({
          entries: JSON.parse(await readFile(path.join(root, "data/pages.json"), "utf-8")),
        }),
        watch: "data/*.json",
      },
      schema: z.object({ title: z.string() }),
    },
  },
});
`;

function pages(...titles: (string | undefined)[]) {
  return JSON.stringify(
    titles.map((title, index) => ({
      metadata: title === undefined ? {} : { title },
      slug: String(index),
    }))
  );
}

interface Post {
  metadata: { date: Date; title: string };
}

interface Posts {
  documents: () => readonly Post[];
  get: (slug: string) => Post | undefined;
}

interface Collections {
  get: (name: string) => Posts | undefined;
  has: (name: string) => boolean;
  names: () => readonly string[];
}

declare global {
  var tomekitRuns: number | undefined;
}

type LoadedModule = Awaited<ReturnType<ViteDevServer["ssrLoadModule"]>>;

function hasCollections(
  module: LoadedModule
): module is LoadedModule & { collections: Collections } {
  return "collections" in module;
}

// Through a file that imports it, the way an app would, not by loading the id directly.
async function loadCollections(dev: ViteDevServer) {
  const module = await dev.ssrLoadModule("/src/read.ts");

  if (!hasCollections(module)) {
    throw new Error("tomekit/content has no collections export");
  }

  return module.collections;
}

async function loadPosts(dev: ViteDevServer) {
  const posts = (await loadCollections(dev)).get("posts");

  if (posts === undefined) {
    throw new Error("tomekit/content has no posts collection");
  }

  return posts;
}

/** A browser's HMR connection to a listening dev server. */
function connect(dev: ViteDevServer) {
  const [local] = dev.resolvedUrls?.local ?? [];

  if (local === undefined) {
    throw new Error("dev server is not listening");
  }

  const url = new URL(local);
  url.protocol = "ws:";

  const socket = new WebSocket(url, "vite-hmr");
  const received: string[] = [];
  socket.addEventListener("message", (event) => {
    received.push(String(event.data));
  });

  return { received, socket };
}

let server: ViteDevServer | undefined;

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  globalThis.tomekitRuns = 0;
  await server?.close();
  await cleanup?.();
});

async function start(
  files: Record<string, string>,
  options: ServerOptions = { hmr: false, middlewareMode: true }
) {
  const project = await createProject({
    "src/read.ts": 'export { collections } from "tomekit/content";\n',
    "tomekit.config.ts": config,
    ...files,
  });

  ({ cleanup } = project);

  const messages: string[] = [];
  const logger = createLogger("silent");
  logger.error = (message) => {
    messages.push(message);
  };

  logger.warn = (message) => {
    messages.push(message);
  };

  server = await createServer({
    configFile: false,
    customLogger: logger,
    plugins: [tomekit()],
    root: project.root,
    server: options,
  });

  function change(file: string) {
    server?.watcher.emit("all", "change", path.join(project.root, file));
  }

  return { change, messages, project, server };
}

const HELLO = "---\ntitle: Hello\ndate: 2026-03-27\n---\n";

const LATER = "---\ntitle: Later\ndate: 2026-04-01\n---\n";

describe("tomekit()", () => {
  it("serves every collection in file name order", async () => {
    const { server: dev } = await start({
      "content/posts/hello.md": HELLO,
      "content/posts/later.md": LATER,
    });

    const posts = await loadPosts(dev);

    expect(posts.documents().map((post) => post.metadata.title)).toStrictEqual([
      "Hello",
      "Later",
    ]);
    expect(posts.get("hello")?.metadata.date).toBeInstanceOf(Date);
  });

  it("serves collection names, and nothing for an unknown name", async () => {
    const { server: dev } = await start({ "content/posts/hello.md": HELLO });

    const collections = await loadCollections(dev);

    expect(collections.names()).toStrictEqual(["posts"]);
    expect(collections.has("posts")).toBe(true);
    expect(collections.get("drafts")).toBeUndefined();
  });

  it("reloads for a new file and reruns only what changed", async () => {
    const {
      change,
      project,
      server: dev,
    } = await start({ "content/posts/hello.md": HELLO });

    await loadPosts(dev);
    expect(globalThis.tomekitRuns).toBe(1);

    await project.write({ "content/posts/later.md": LATER });
    change("content/posts/later.md");
    const posts = await loadPosts(dev);

    expect(posts.get("later")?.metadata.title).toBe("Later");
    expect(globalThis.tomekitRuns).toBe(2);
  });

  it("ignores changes to files outside the collection", async () => {
    const {
      change,
      project,
      server: dev,
    } = await start({ "content/posts/hello.md": HELLO });

    await loadPosts(dev);

    await project.write({ "content/posts/later.txt": LATER });
    change("content/posts/later.txt");
    const posts = await loadPosts(dev);

    expect(posts.documents()).toHaveLength(1);
  });

  it("keeps serving the other files when one is broken", async () => {
    const { messages, server: dev } = await start({
      "content/posts/broken.md": "---\ntitle: Broken\n---\n",
      "content/posts/hello.md": HELLO,
    });

    const posts = await loadPosts(dev);

    expect(posts.documents().map((post) => post.metadata.title)).toStrictEqual([
      "Hello",
    ]);
    expect(messages.join("\n")).toContain("content/posts/broken.md:2:1: date:");
  });

  it("shows broken files in the error overlay", async () => {
    const {
      change,
      project,
      server: dev,
    } = await start({ "content/posts/hello.md": HELLO });

    const sent: HotPayload[] = [];
    dev.environments.client.hot.send = (payload: HotPayload) => {
      sent.push(payload);
    };

    await project.write({ "content/posts/broken.md": "---\ntitle: 1\n---\n" });
    change("content/posts/broken.md");
    await loadPosts(dev);

    const overlay = sent.find((payload) => payload.type === "error");
    expect(overlay?.err.plugin).toBe("tomekit");
    expect(overlay?.err.loc).toStrictEqual({
      column: 1,
      file: path.join(project.root, "content/posts/broken.md"),
      line: 2,
    });
    expect(overlay?.err.message).toContain(
      "content/posts/broken.md:2:1: date:"
    );
  });

  it("shows the overlay again to a browser that connects later", async () => {
    const { server: dev } = await start(
      {
        "content/posts/broken.md": "---\ntitle: 1\n---\n",
        "content/posts/hello.md": HELLO,
      },
      { port: 0 }
    );

    await dev.listen();

    // Vite replays a buffered error to the first browser only, so the second one tests the resend.
    const first = connect(dev);
    await expect
      .poll(() => first.received.join("\n"))
      .toContain('"type":"connected"');

    const second = connect(dev);
    await expect
      .poll(() => second.received.join("\n"))
      .toContain("content/posts/broken.md:2:1: date:");

    first.socket.close();
    second.socket.close();
  });

  it("reruns a loader when a file it watches changes", async () => {
    const {
      change,
      project,
      server: dev,
    } = await start({
      "data/pages.json": pages("One"),
      "tomekit.config.ts": loaderConfig,
    });

    const before = (await loadCollections(dev)).get("pages")?.get("0");
    expect(before?.metadata.title).toBe("One");

    await project.write({ "data/pages.json": pages("Two") });
    change("data/pages.json");
    const after = (await loadCollections(dev)).get("pages")?.get("0");

    expect(after?.metadata.title).toBe("Two");
  });

  it("points the overlay at the config for an entry without a file", async () => {
    const {
      change,
      project,
      server: dev,
    } = await start({
      "data/pages.json": pages("One"),
      "tomekit.config.ts": loaderConfig,
    });

    const sent: HotPayload[] = [];
    dev.environments.client.hot.send = (payload: HotPayload) => {
      sent.push(payload);
    };

    await project.write({ "data/pages.json": pages(undefined) });
    change("data/pages.json");
    await loadCollections(dev);

    const overlay = sent.find((payload) => payload.type === "error");
    expect(overlay?.err.loc?.file).toBe(
      path.join(project.root, "tomekit.config.ts")
    );
    expect(overlay?.err.message).toContain(
      'collections.get("pages").get("0"): title:'
    );
  });

  it("fails on collection names it cannot generate types for", async () => {
    const { server: dev } = await start({
      "tomekit.config.ts": config.replace(
        "posts: defineCollection",
        '"blog-posts": defineCollection'
      ),
    });

    await expect(loadPosts(dev)).rejects.toThrow(
      'tomekit.config.ts is invalid:\ncollection "blog-posts" has an invalid name.'
    );
  });

  it("warns when tsconfig.json does not map tomekit/content", async () => {
    const { messages } = await start({
      "content/posts/hello.md": HELLO,
      "tsconfig.json": '{ "compilerOptions": { "strict": true } }',
    });

    expect(messages.join("\n")).toContain(
      '"tomekit/content*": ["./.tomekit/content*"]'
    );
  });

  it("warns when tomekit/content reaches the browser bundle", async () => {
    const { messages, server: dev } = await start({
      "content/posts/hello.md": HELLO,
    });

    await dev.environments.client.transformRequest("tomekit/content");

    expect(messages.join("\n")).toContain("imported in the browser bundle");
  });

  it("keeps tomekit out of dependency pre-bundling in every environment", async () => {
    const { server: dev } = await start({});

    for (const environment of Object.values(dev.environments)) {
      expect(environment.config.optimizeDeps.exclude).toEqual(
        expect.arrayContaining(["tomekit", "tomekit/content"])
      );
    }
  });

  it("writes types for tomekit/content into .tomekit", async () => {
    const { project } = await start({ "content/posts/hello.md": HELLO });

    const posts = await readFile(
      path.join(project.root, ".tomekit", "content.d.ts"),
      "utf-8"
    );

    expect(posts).toContain('  "posts": "hello";');
  });

  it("rewrites types after a change, before anything imports the content", async () => {
    const { change, project } = await start({
      "content/posts/hello.md": HELLO,
    });

    await project.write({ "content/posts/later.md": LATER });
    change("content/posts/later.md");

    await expect
      .poll(
        async () =>
          await readFile(
            path.join(project.root, ".tomekit", "content.d.ts"),
            "utf-8"
          )
      )
      .toContain('  "posts": "hello" | "later";');
  });

  it("logs a config that fails to load as soon as the server starts", async () => {
    const { messages } = await start({
      "tomekit.config.ts": 'throw new Error("typo in config");\n',
    });

    expect(messages.join("\n")).toContain(
      "[tomekit] tomekit.config.ts failed to load: typo in config"
    );
  });

  it("names the default export a config needs", async () => {
    const { messages } = await start({
      "tomekit.config.ts": "export const collections = {};\n",
    });

    expect(messages.join("\n")).toContain(
      "tomekit.config.ts must export a config as its default export"
    );
  });
});

describe("vite build", () => {
  it("fails with every broken file", async () => {
    const project = await createProject({
      "content/posts/a.md": "---\ntitle: A\n---\n",
      "content/posts/b.md": "---\ndate: 2026-03-27\n---\n",
      "src/read.ts": 'export { collections } from "tomekit/content";\n',
      "tomekit.config.ts": config,
    });

    ({ cleanup } = project);

    const result = build({
      build: {
        rolldownOptions: { input: "src/read.ts" },
        ssr: true,
        write: false,
      },
      configFile: false,
      logLevel: "silent",
      plugins: [tomekit()],
      root: project.root,
    });

    await expect(result).rejects.toThrow(
      /2 content files have errors:\ncontent\/posts\/a\.md:2:1: date: .*\ncontent\/posts\/b\.md:2:1: title: /u
    );
  });

  it("fails on broken content even when nothing imports it", async () => {
    const project = await createProject({
      "content/posts/a.md": "---\ntitle: A\n---\n",
      "src/main.ts": "export const answer = 42;\n",
      "tomekit.config.ts": config,
    });

    ({ cleanup } = project);

    const result = build({
      build: {
        rolldownOptions: { input: "src/main.ts" },
        ssr: true,
        write: false,
      },
      configFile: false,
      logLevel: "silent",
      plugins: [tomekit()],
      root: project.root,
    });

    await expect(result).rejects.toThrow("1 content file has errors:");
    // The bundler wraps plugin errors and keeps the originals under `errors`.
    const failure: unknown = await result.catch((cause: unknown) => cause);

    expect(failure).toHaveProperty(["errors", 0, "name"], "BrokenContentError");
  });
});

describe("tomekit/content without the plugin", () => {
  it("fails with a message that names the missing plugin", async () => {
    await expect(import("../src/content")).rejects.toThrow(
      "tomekit() Vite plugin"
    );
  });
});
