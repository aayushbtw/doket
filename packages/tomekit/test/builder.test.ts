import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { ContentBuilder } from "../src/builder";
import { ConfigLoadError } from "../src/errors";
import { createProject, QUERY, SOURCE } from "./project";

// Counts `load` runs on `globalThis`, which the config shares with the test
// even though Vite imports it separately.
const config = `
import { z } from "zod";
import { defineCollection, defineConfig, directory } from ${JSON.stringify(SOURCE)};

export default defineConfig({
  collections: {
    data: defineCollection({
      loader: {
        load: () => {
          globalThis.tomekitLoads = (globalThis.tomekitLoads ?? 0) + 1;
          return { entries: [{ slug: "one" }] };
        },
        watch: "data/*.json",
      },
      schema: z.object({}),
    }),
    posts: defineCollection({
      loader: directory("content/posts", { exclude: "drafts/**" }),
      schema: z.object({ title: z.string() }),
    }),
  },
});
`;

declare global {
  var tomekitLoads: number | undefined;
}

const HELLO = "---\ntitle: Hello\n---\n";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  globalThis.tomekitLoads = 0;
  await cleanup?.();
});

interface BuilderSetup {
  types?: string | false;
}

async function createBuilder(
  files: Record<string, string>,
  { types = false }: BuilderSetup = {}
) {
  const project = await createProject({
    "tomekit.config.ts": config,
    ...files,
  });

  ({ cleanup } = project);

  const builder = new ContentBuilder({
    configPath: path.join(project.root, "tomekit.config.ts"),
    root: project.root,
    runtime: QUERY,
    types: types === false ? false : path.join(project.root, types),
  });

  function changed(file: string) {
    return builder.changed(path.join(project.root, file));
  }

  return { builder, changed, project };
}

describe("ContentBuilder", () => {
  it("shares one build between callers until something changes", async () => {
    const { builder, changed, project } = await createBuilder({
      "content/posts/hello.md": HELLO,
    });

    const [first, second] = await Promise.all([builder.load(), builder.load()]);
    expect(first).toBe(second);

    await project.write({
      "content/posts/later.md": "---\ntitle: Later\n---\n",
    });
    changed("content/posts/later.md");
    const next = await builder.load();

    expect(next).not.toBe(first);
    expect(next.code).toContain('"later"');
  });

  it("retries a config that failed to load on the next call", async () => {
    const { builder, project } = await createBuilder({
      "content/posts/hello.md": HELLO,
      "tomekit.config.ts": 'throw new Error("typo in config");\n',
    });

    await expect(builder.load()).rejects.toThrow(ConfigLoadError);

    await project.write({ "tomekit.config.ts": config });
    const build = await builder.load();

    expect(build.code).toContain('"posts":createCollection(');
  });

  it("keeps broken files out of the module and in the errors", async () => {
    const { builder } = await createBuilder({
      "content/posts/broken.md": "---\ntitle: 1\n---\n",
      "content/posts/hello.md": HELLO,
    });

    const build = await builder.load();

    expect(build.code).toContain('"hello"');
    expect(build.code).not.toContain('"broken"');
    expect(build.errors.map((error) => error.file)).toStrictEqual([
      "content/posts/broken.md",
    ]);
  });

  it("tells changes that matter from the rest", async () => {
    const { builder, changed } = await createBuilder({
      "content/posts/hello.md": HELLO,
    });

    await builder.load();

    expect(changed("content/posts/notes.txt")).toBe(false);
    expect(changed("content/pages/about.md")).toBe(false);
    expect(changed("content/posts/drafts/wip.md")).toBe(false);
    expect(changed("content/posts/new.md")).toBe(true);
    expect(changed("data/pages.json")).toBe(true);
    expect(changed("tomekit.config.ts")).toBe(true);
  });

  it("reruns a loader only when a file it watches or the config changes", async () => {
    const { builder, changed } = await createBuilder({
      "content/posts/hello.md": HELLO,
    });

    await builder.load();
    changed("content/posts/new.md");
    await builder.load();
    expect(globalThis.tomekitLoads).toBe(1);

    changed("data/pages.json");
    await builder.load();
    expect(globalThis.tomekitLoads).toBe(2);

    changed("tomekit.config.ts");
    await builder.load();
    expect(globalThis.tomekitLoads).toBe(3);
  });

  it("watches the config and where each loader's globs start", async () => {
    const { builder, project } = await createBuilder({
      "content/posts/hello.md": HELLO,
    });

    await builder.load();

    expect(builder.watchFiles).toEqual(
      expect.arrayContaining([
        path.join(project.root, "tomekit.config.ts"),
        path.join(project.root, "content/posts"),
        path.join(project.root, "data"),
      ])
    );
  });

  it("warns about an unmapped tsconfig only on the first build", async () => {
    const { builder, changed } = await createBuilder(
      {
        "content/posts/hello.md": HELLO,
        "tsconfig.json": '{ "compilerOptions": { "strict": true } }',
      },
      { types: ".tomekit" }
    );

    const first = await builder.load();
    changed("content/posts/hello.md");
    const second = await builder.load();

    expect(first.warnings).toStrictEqual([
      expect.stringContaining('tsconfig.json does not map "tomekit/content"'),
    ]);
    expect(second.warnings).toStrictEqual([]);
  });
});
