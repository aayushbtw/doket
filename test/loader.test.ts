import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { ConfigLoadError } from "../src/errors";
import { ContentLoader } from "../src/loader";
import { createProject, SOURCE } from "./project";

const config = `
import { z } from "zod";
import { defineCollection, defineConfig } from ${JSON.stringify(SOURCE)};

export default defineConfig({
  collections: {
    posts: defineCollection({
      directory: "content/posts",
      schema: z.object({ title: z.string() }),
    }),
  },
});
`;

const HELLO = "---\ntitle: Hello\n---\n";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
});

interface LoaderSetup {
  types?: string | false;
}

async function createLoader(
  files: Record<string, string>,
  { types = false }: LoaderSetup = {}
) {
  const project = await createProject({
    "tomekit.config.ts": config,
    ...files,
  });

  ({ cleanup } = project);

  const loader = new ContentLoader({
    configPath: path.join(project.root, "tomekit.config.ts"),
    root: project.root,
    types: types === false ? false : path.join(project.root, types),
  });

  return { loader, project };
}

describe("ContentLoader", () => {
  it("shares one build between callers until it is invalidated", async () => {
    const { loader, project } = await createLoader({
      "content/posts/hello.md": HELLO,
    });

    const [first, second] = await Promise.all([loader.load(), loader.load()]);
    expect(first).toBe(second);

    await project.write({
      "content/posts/later.md": "---\ntitle: Later\n---\n",
    });
    loader.invalidate("content");
    const next = await loader.load();

    expect(next).not.toBe(first);
    expect(next.code).toContain('"later"');
  });

  it("retries a config that failed to load on the next call", async () => {
    const { loader, project } = await createLoader({
      "content/posts/hello.md": HELLO,
      "tomekit.config.ts": 'throw new Error("typo in config");\n',
    });

    await expect(loader.load()).rejects.toThrow(ConfigLoadError);

    await project.write({ "tomekit.config.ts": config });
    const build = await loader.load();

    expect(build.code).toContain('"posts":createCollection(');
  });

  it("keeps broken files out of the module and in the errors", async () => {
    const { loader } = await createLoader({
      "content/posts/broken.md": "---\ntitle: 1\n---\n",
      "content/posts/hello.md": HELLO,
    });

    const build = await loader.load();

    expect(build.code).toContain('"hello"');
    expect(build.code).not.toContain('"broken"');
    expect(build.errors.map((error) => error.file)).toStrictEqual([
      "content/posts/broken.md",
    ]);
  });

  it("tells config changes from content changes and ignores the rest", async () => {
    const { loader, project } = await createLoader({
      "content/posts/hello.md": HELLO,
    });

    await loader.load();

    function affected(file: string) {
      return loader.affected(path.join(project.root, file));
    }

    expect(affected("tomekit.config.ts")).toBe("config");
    expect(affected("content/posts/new.md")).toBe("content");
    expect(affected("content/posts/notes.txt")).toBeUndefined();
    expect(affected("content/pages/about.md")).toBeUndefined();
  });

  it("watches the config and each collection directory", async () => {
    const { loader, project } = await createLoader({
      "content/posts/hello.md": HELLO,
    });

    await loader.load();

    expect(loader.watchFiles).toEqual(
      expect.arrayContaining([
        path.join(project.root, "tomekit.config.ts"),
        path.join(project.root, "content/posts"),
      ])
    );
  });

  it("warns about an unmapped tsconfig only on the first build", async () => {
    const { loader } = await createLoader(
      {
        "content/posts/hello.md": HELLO,
        "tsconfig.json": '{ "compilerOptions": { "strict": true } }',
      },
      { types: ".tomekit" }
    );

    const first = await loader.load();
    loader.invalidate("content");
    const second = await loader.load();

    expect(first.warnings).toStrictEqual([
      expect.stringContaining('tsconfig.json does not map "tomekit/content"'),
    ]);
    expect(second.warnings).toStrictEqual([]);
  });
});
