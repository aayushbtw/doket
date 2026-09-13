import { afterEach, describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { defineCollection } from "../src/index";
import { loadCollection } from "../src/load";
import type { FileCache } from "../src/load";
import { createProject } from "./project";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});

const posts = defineCollection({
  directory: "content/posts",
  include: "**/*.md",
  schema: z.object({
    tags: z.array(z.string()).default([]),
    title: z.string(),
  }),
});

async function project(files: Record<string, string>) {
  const created = await createProject(files);
  ({ cleanup } = created);
  return created.root;
}

function outputs(entries: { output: unknown }[]) {
  return entries.map((entry) => entry.output);
}

describe("loadCollection", () => {
  it("parses frontmatter, body, slug and file, in file name order", async () => {
    const root = await project({
      "content/posts/b.md":
        "---\ntitle: B\ntags:\n  - one\n  - two\n---\n\nBody of B\n",
      "content/posts/nested/a.md": "---\ntitle: A\n---\nBody of A",
    });

    const entries = await loadCollection("posts", posts, root);

    expect(entries).toStrictEqual([
      {
        filePath: "content/posts/b.md",
        output: {
          content: "\nBody of B\n",
          file: { name: "b.md", path: "content/posts/b.md" },
          slug: "b",
          tags: ["one", "two"],
          title: "B",
        },
        slug: "b",
      },
      {
        filePath: "content/posts/nested/a.md",
        output: {
          content: "Body of A",
          file: { name: "a.md", path: "content/posts/nested/a.md" },
          slug: "nested/a",
          tags: [],
          title: "A",
        },
        slug: "nested/a",
      },
    ]);
  });

  it("uses a frontmatter slug over the file name", async () => {
    const withSlug = defineCollection({
      directory: "content/posts",
      include: "*.md",
      schema: z.object({ slug: z.string().optional(), title: z.string() }),
    });
    const root = await project({
      "content/posts/2026-03-27-hello.md":
        "---\ntitle: Hello\nslug: hello\n---\n",
      "content/posts/plain.md": "---\ntitle: Plain\n---\n",
    });

    const entries = await loadCollection("posts", withSlug, root);

    expect(entries.map((entry) => entry.slug)).toStrictEqual([
      "hello",
      "plain",
    ]);
  });

  it("warns about reserved frontmatter and keeps its own values", async () => {
    const loose = defineCollection({
      directory: "content/posts",
      include: "*.md",
      schema: z.looseObject({ title: z.string() }),
    });
    const root = await project({
      "content/posts/clash.md":
        "---\ntitle: Clash\ncontent: mine\nfile: mine\n---\nBody",
    });
    const warnings: string[] = [];

    const entries = await loadCollection("posts", loose, root, {
      warn: (message) => {
        warnings.push(message);
      },
    });

    expect(warnings).toStrictEqual([
      'content/posts/clash.md: frontmatter "content" is reserved and was ignored',
      'content/posts/clash.md: frontmatter "file" is reserved and was ignored',
    ]);
    expect(outputs(entries)).toMatchObject([
      { content: "Body", file: { name: "clash.md" } },
    ]);
  });

  it("accepts a file with an empty or missing frontmatter block", async () => {
    const loose = defineCollection({
      directory: "content/posts",
      include: "*.md",
      schema: z.object({}),
    });
    const root = await project({
      "content/posts/empty.md": "---\n---\nOnly body",
      "content/posts/none.md": "No frontmatter",
    });

    const entries = await loadCollection("posts", loose, root);

    expect(outputs(entries)).toMatchObject([
      { content: "Only body" },
      { content: "No frontmatter" },
    ]);
  });

  it("matches several include patterns and leaves out excluded ones", async () => {
    const mixed = defineCollection({
      ...posts,
      exclude: ["drafts/**", "*.draft.md"],
      include: ["**/*.md", "**/*.markdown"],
    });
    const root = await project({
      "content/posts/a.md": "---\ntitle: A\n---\n",
      "content/posts/b.markdown": "---\ntitle: B\n---\n",
      "content/posts/c.draft.md": "---\ntitle: C\n---\n",
      "content/posts/drafts/d.md": "---\ntitle: D\n---\n",
    });

    const entries = await loadCollection("posts", mixed, root);

    expect(outputs(entries)).toMatchObject([{ title: "A" }, { title: "B" }]);
  });

  it("runs the transform and keeps the slug for lookups", async () => {
    const root = await project({
      "content/posts/hello.md": "---\ntitle: Hello\n---\n",
    });
    const titleOnly = defineCollection({
      ...posts,
      transform: (document) => ({ title: document.title }),
    });

    const entries = await loadCollection("posts", titleOnly, root);

    expect(entries).toStrictEqual([
      {
        filePath: "content/posts/hello.md",
        output: { title: "Hello" },
        slug: "hello",
      },
    ]);
  });

  it("leaves out documents the transform skips", async () => {
    const root = await project({
      "content/posts/draft.md": "---\ntitle: Draft\ntags: [draft]\n---\n",
      "content/posts/live.md": "---\ntitle: Live\n---\n",
    });
    const published = defineCollection({
      ...posts,
      transform: (document, { skip }) =>
        document.tags.includes("draft")
          ? skip("draft")
          : { title: document.title },
    });

    const entries = await loadCollection("posts", published, root);

    expect(outputs(entries)).toStrictEqual([{ title: "Live" }]);
  });

  it("names the file and field when validation fails", async () => {
    const root = await project({
      "content/posts/broken.md": "---\ntags: []\n---\n",
    });

    await expect(loadCollection("posts", posts, root)).rejects.toThrow(
      /^content\/posts\/broken\.md: title: /u
    );
  });

  it("names the file when the frontmatter is not valid YAML", async () => {
    const root = await project({
      "content/posts/bad.md": "---\ntitle: [unclosed\n---\n",
    });

    await expect(loadCollection("posts", posts, root)).rejects.toThrow(
      /^content\/posts\/bad\.md: /u
    );
  });

  it("matches Markdown files anywhere in the directory by default", async () => {
    const markdown = defineCollection({
      directory: "content/posts",
      schema: z.object({ title: z.string() }),
    });
    const root = await project({
      "content/posts/a.md": "---\ntitle: A\n---\n",
      "content/posts/deep/b.md": "---\ntitle: B\n---\n",
      "content/posts/image.png": "not markdown",
    });

    const entries = await loadCollection("posts", markdown, root);

    expect(outputs(entries)).toMatchObject([{ title: "A" }, { title: "B" }]);
  });

  it("warns when the directory is missing or nothing matches", async () => {
    const root = await project({ "content/posts/notes.txt": "text" });
    const warnings: string[] = [];
    function warn(message: string) {
      warnings.push(message);
    }

    await loadCollection(
      "typo",
      defineCollection({ ...posts, directory: "content/post" }),
      root,
      { warn }
    );
    await loadCollection("posts", posts, root, { warn });

    expect(warnings).toStrictEqual([
      'typo: directory "content/post" does not exist',
      'posts: no files in "content/posts" match "**/*.md"',
    ]);
  });

  it("fails on a slug used by two files", async () => {
    const withSlug = defineCollection({
      directory: "content/posts",
      schema: z.object({ slug: z.string().optional(), title: z.string() }),
    });
    const root = await project({
      "content/posts/a.md": "---\ntitle: A\nslug: same\n---\n",
      "content/posts/same.md": "---\ntitle: Same\n---\n",
    });

    await expect(loadCollection("posts", withSlug, root)).rejects.toThrow(
      'content/posts/same.md: slug "same" is already used by content/posts/a.md'
    );
  });

  it("reports failing files and keeps the rest when given onError", async () => {
    const root = await project({
      "content/posts/broken.md": "---\ntags: []\n---\n",
      "content/posts/fine.md": "---\ntitle: Fine\n---\n",
    });
    const errors: string[] = [];

    const entries = await loadCollection("posts", posts, root, {
      onError: (error) => {
        errors.push(error.message);
      },
    });

    expect(outputs(entries)).toMatchObject([{ title: "Fine" }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^content\/posts\/broken\.md: title: /u);
  });

  it("reruns the transform only for files that changed", async () => {
    const created = await createProject({
      "content/posts/a.md": "---\ntitle: A\n---\n",
      "content/posts/b.md": "---\ntitle: B\n---\n",
    });
    ({ cleanup } = created);
    const transformed: string[] = [];
    const counted = defineCollection({
      ...posts,
      transform: (document) => {
        transformed.push(document.slug);
        return { title: document.title };
      },
    });
    const cache: FileCache = new Map();

    await loadCollection("posts", counted, created.root, { cache });
    await created.write({ "content/posts/b.md": "---\ntitle: B2\n---\n" });
    const entries = await loadCollection("posts", counted, created.root, {
      cache,
    });

    expect(transformed).toStrictEqual(["a", "b", "b"]);
    expect(outputs(entries)).toStrictEqual([{ title: "A" }, { title: "B2" }]);
  });
});
