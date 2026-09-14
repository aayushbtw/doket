import { afterEach, describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { loadCollection } from "../src/collection";
import type { FileCache } from "../src/collection";
import {
  TransformResultError,
  UnknownTransformFieldError,
  UnserializableValueError,
} from "../src/errors";
import { defineCollection } from "../src/index";
import type { CollectionConfig } from "../src/index";
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

function outputs(documents: { output: unknown }[]) {
  return documents.map((document) => document.output);
}

function messages(errors: readonly Error[]) {
  return errors.map((error) => error.message);
}

describe("loadCollection", () => {
  it("builds slug, metadata, body and file, in file name order", async () => {
    const root = await project({
      "content/posts/b.md":
        "---\ntitle: B\ntags:\n  - one\n  - two\n---\n\nBody of B\n",
      "content/posts/nested/a.md": "---\ntitle: A\n---\nBody of A",
    });

    const { documents } = await loadCollection("posts", posts, root);

    expect(
      documents.map(({ filePath, output, slug }) => ({
        filePath,
        output,
        slug,
      }))
    ).toStrictEqual([
      {
        filePath: "content/posts/b.md",
        output: {
          body: "\nBody of B\n",
          file: { name: "b.md", path: "content/posts/b.md" },
          metadata: { tags: ["one", "two"], title: "B" },
          slug: "b",
        },
        slug: "b",
      },
      {
        filePath: "content/posts/nested/a.md",
        output: {
          body: "Body of A",
          file: { name: "a.md", path: "content/posts/nested/a.md" },
          metadata: { tags: [], title: "A" },
          slug: "nested/a",
        },
        slug: "nested/a",
      },
    ]);
  });

  it("uses a frontmatter slug over the file name", async () => {
    const withSlug = defineCollection({
      directory: "content/posts",
      include: "*.md",
      schema: z.object({ title: z.string() }),
    });

    const root = await project({
      "content/posts/2026-03-27-hello.md":
        "---\ntitle: Hello\nslug: hello\n---\n",
      "content/posts/plain.md": "---\ntitle: Plain\n---\n",
    });

    const { documents } = await loadCollection("posts", withSlug, root);

    expect(documents.map((document) => document.slug)).toStrictEqual([
      "hello",
      "plain",
    ]);
  });

  it("keeps frontmatter named like a document field inside metadata", async () => {
    const loose = defineCollection({
      directory: "content/posts",
      include: "*.md",
      schema: z.looseObject({ title: z.string() }),
    });

    const root = await project({
      "content/posts/clash.md":
        "---\ntitle: Clash\nbody: mine\nfile: mine\n---\nBody",
    });

    const { documents, warnings } = await loadCollection("posts", loose, root);

    expect(warnings).toStrictEqual([]);
    expect(outputs(documents)).toMatchObject([
      {
        body: "Body",
        file: { name: "clash.md" },
        metadata: { body: "mine", file: "mine", title: "Clash" },
      },
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

    const { documents } = await loadCollection("posts", loose, root);

    expect(outputs(documents)).toMatchObject([
      { body: "Only body", metadata: {} },
      { body: "No frontmatter", metadata: {} },
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

    const { documents } = await loadCollection("posts", mixed, root);

    expect(outputs(documents)).toMatchObject([
      { metadata: { title: "A" } },
      { metadata: { title: "B" } },
    ]);
  });

  it("replaces only the metadata a transform returns", async () => {
    const root = await project({
      "content/posts/hello.md": "---\ntitle: Hello\n---\nText",
    });

    const titleOnly = defineCollection({
      ...posts,
      transform: ({ metadata }) => ({ metadata: { title: metadata.title } }),
    });

    const { documents } = await loadCollection("posts", titleOnly, root);

    expect(outputs(documents)).toStrictEqual([
      {
        body: "Text",
        file: { name: "hello.md", path: "content/posts/hello.md" },
        metadata: { title: "Hello" },
        slug: "hello",
      },
    ]);
    expect(documents[0]?.code).toMatch(/^JSON\.parse\(/u);
  });

  it("replaces only the body a transform returns", async () => {
    const root = await project({
      "content/posts/hello.md": "---\ntitle: Hello\n---\nText",
    });

    const loud = defineCollection({
      ...posts,
      transform: ({ body }) => ({ body: body.toUpperCase() }),
    });

    const { documents } = await loadCollection("posts", loud, root);

    expect(outputs(documents)).toMatchObject([
      { body: "TEXT", metadata: { title: "Hello" } },
    ]);
  });

  it("leaves out files the transform skips", async () => {
    const root = await project({
      "content/posts/draft.md": "---\ntitle: Draft\ntags: [draft]\n---\n",
      "content/posts/live.md": "---\ntitle: Live\n---\n",
    });

    const published = defineCollection({
      ...posts,
      transform: ({ metadata }, { skip }) =>
        metadata.tags.includes("draft") ? skip("draft") : {},
    });

    const { documents } = await loadCollection("posts", published, root);

    expect(outputs(documents)).toMatchObject([{ metadata: { title: "Live" } }]);
  });

  it("passes the collection name to the transform", async () => {
    const root = await project({
      "content/posts/hello.md": "---\ntitle: Hello\n---\n",
    });

    const withUrl = defineCollection({
      ...posts,
      transform: ({ metadata, slug }, { collection }) => ({
        metadata: { ...metadata, url: `/${collection}/${slug}` },
      }),
    });

    const { documents } = await loadCollection("posts", withUrl, root);

    expect(outputs(documents)).toMatchObject([
      { metadata: { url: "/posts/hello" } },
    ]);
  });

  it("fails when a transform returns a field documents do not have", async () => {
    const root = await project({
      "content/posts/hello.md": "---\ntitle: Hello\n---\n",
    });

    // Typed loosely, as JavaScript config would be, so the check that runs is the one at build time.
    const extraField: CollectionConfig = {
      ...posts,
      transform: () => ({ url: "/posts/hello" }),
    };

    const { documents, errors } = await loadCollection(
      "posts",
      extraField,
      root
    );

    expect(documents).toStrictEqual([]);
    expect(errors[0]?.cause).toBeInstanceOf(UnknownTransformFieldError);
    expect(messages(errors)[0]).toBe(
      'content/posts/hello.md: transform returned "url", but it can only return `metadata` and `body`. Put derived values inside `metadata` instead.'
    );
  });

  it("fails when a transform returns something other than an object", async () => {
    const root = await project({
      "content/posts/hello.md": "---\ntitle: Hello\n---\n",
    });

    const text: CollectionConfig = { ...posts, transform: () => "hello" };

    const { errors } = await loadCollection("posts", text, root);

    expect(errors[0]?.cause).toBeInstanceOf(TransformResultError);
  });

  it("reports every broken file with its line and column, and keeps the rest", async () => {
    const root = await project({
      "content/posts/bad-yaml.md": "---\ntitle: [unclosed\n---\n",
      "content/posts/fine.md": "---\ntitle: Fine\n---\n",
      "content/posts/no-title.md": "---\ntags:\n  - one\n  - 2\n---\n",
    });

    const { documents, errors } = await loadCollection("posts", posts, root);

    expect(outputs(documents)).toMatchObject([{ metadata: { title: "Fine" } }]);
    expect(messages(errors)).toStrictEqual([
      expect.stringMatching(
        /^content\/posts\/bad-yaml\.md:2:17: Flow sequence/u
      ),
      expect.stringMatching(/^content\/posts\/no-title\.md:4:5: tags\.1: /u),
      expect.stringMatching(/^content\/posts\/no-title\.md:2:1: title: /u),
    ]);
    expect(errors[1]).toMatchObject({
      column: 5,
      file: "content/posts/no-title.md",
      line: 4,
    });
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

    const { documents } = await loadCollection("posts", markdown, root);

    expect(outputs(documents)).toMatchObject([
      { metadata: { title: "A" } },
      { metadata: { title: "B" } },
    ]);
  });

  it("warns when the directory is missing or nothing matches", async () => {
    const root = await project({ "content/posts/notes.txt": "text" });

    const missing = await loadCollection(
      "blogPosts",
      defineCollection({ ...posts, directory: "content/post" }),
      root
    );

    const empty = await loadCollection("posts", posts, root);

    expect([...missing.warnings, ...empty.warnings]).toStrictEqual([
      'blogPosts: directory "content/post" does not exist, so collections.get("blogPosts") is empty',
      'posts: no files in "content/posts" match "**/*.md", so collections.get("posts") is empty',
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

    const { documents, errors } = await loadCollection("posts", withSlug, root);

    expect(documents.map((document) => document.slug)).toStrictEqual(["same"]);
    expect(messages(errors)).toStrictEqual([
      'content/posts/same.md: slug "same" is already used by content/posts/a.md',
    ]);
  });

  it("names the file and key of output that cannot be written", async () => {
    const root = await project({
      "content/posts/a.md": "---\ntitle: A\n---\n",
    });

    class Author {
      name = "Ada";
    }

    const withClass = defineCollection({
      ...posts,
      transform: () => ({ metadata: { list: [new Author()] } }),
    });

    const { errors } = await loadCollection("posts", withClass, root);

    expect(errors[0]?.cause).toBeInstanceOf(UnserializableValueError);
    expect(messages(errors)[0]).toMatch(
      /^content\/posts\/a\.md: cannot write an instance of Author at metadata\.list\[0\] into content/u
    );
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
      transform: ({ metadata, slug }) => {
        transformed.push(slug);

        return { metadata: { title: metadata.title } };
      },
    });

    const cache: FileCache = new Map();

    await loadCollection("posts", counted, created.root, { cache });
    await created.write({ "content/posts/b.md": "---\ntitle: B2\n---\n" });

    const { documents } = await loadCollection("posts", counted, created.root, {
      cache,
    });

    // Files load in parallel, so only which ones reran is stable, not their order.
    expect(transformed.toSorted()).toStrictEqual(["a", "b", "b"]);
    expect(outputs(documents)).toMatchObject([
      { metadata: { title: "A" } },
      { metadata: { title: "B2" } },
    ]);
  });
});
