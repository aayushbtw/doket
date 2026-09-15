import { afterEach, describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { loadCollection } from "../src/collection";
import { directory } from "../src/directory";
import { defineCollection } from "../src/index";
import { createProject } from "./project";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
});

async function project(files: Record<string, string>) {
  const created = await createProject(files);
  ({ cleanup } = created);

  return created.root;
}

const posts = defineCollection({
  loader: directory("content/posts"),
  schema: z.object({
    tags: z.array(z.string()).default([]),
    title: z.string(),
  }),
});

function outputs(documents: { output: unknown }[]) {
  return documents.map((document) => document.output);
}

function messages(errors: readonly Error[]) {
  return errors.map((error) => error.message);
}

describe("directory", () => {
  it("builds slug, metadata, body and file, in file name order", async () => {
    const root = await project({
      "content/posts/b.md":
        "---\ntitle: B\ntags:\n  - one\n  - two\n---\n\nBody of B\n",
      "content/posts/nested/a.md": "---\ntitle: A\n---\nBody of A",
    });

    const { documents } = await loadCollection("posts", posts, root);

    expect(outputs(documents)).toStrictEqual([
      {
        body: "\nBody of B\n",
        file: { name: "b.md", path: "content/posts/b.md" },
        metadata: { tags: ["one", "two"], title: "B" },
        slug: "b",
      },
      {
        body: "Body of A",
        file: { name: "a.md", path: "content/posts/nested/a.md" },
        metadata: { tags: [], title: "A" },
        slug: "nested/a",
      },
    ]);
  });

  it("uses a frontmatter slug over the file name", async () => {
    const root = await project({
      "content/posts/2026-03-27-hello.md":
        "---\ntitle: Hello\nslug: hello\n---\n",
      "content/posts/plain.md": "---\ntitle: Plain\n---\n",
    });

    const { documents } = await loadCollection("posts", posts, root);

    expect(documents.map((document) => document.slug)).toStrictEqual([
      "hello",
      "plain",
    ]);
  });

  it("keeps frontmatter named like a document field inside metadata", async () => {
    const loose = defineCollection({
      loader: directory("content/posts"),
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
      loader: directory("content/posts"),
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
      loader: directory("content/posts", {
        exclude: ["drafts/**", "*.draft.md"],
        include: ["**/*.md", "**/*.markdown"],
      }),
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

  it("matches Markdown files anywhere in the directory by default", async () => {
    const root = await project({
      "content/posts/a.md": "---\ntitle: A\n---\n",
      "content/posts/deep/b.md": "---\ntitle: B\n---\n",
      "content/posts/image.png": "not markdown",
    });

    const { documents } = await loadCollection("posts", posts, root);

    expect(outputs(documents)).toMatchObject([
      { metadata: { title: "A" } },
      { metadata: { title: "B" } },
    ]);
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

  it("reports a bad slug together with schema errors, and leaves the file out", async () => {
    const root = await project({
      "content/posts/bad.md": '---\nslug: ""\n---\n',
      "content/posts/fine.md": "---\ntitle: Fine\n---\n",
    });

    const { documents, errors } = await loadCollection("posts", posts, root);

    expect(documents.map((document) => document.slug)).toStrictEqual(["fine"]);
    expect(messages(errors)).toStrictEqual([
      expect.stringMatching(/^content\/posts\/bad\.md:2:1: slug: /u),
      expect.stringMatching(/^content\/posts\/bad\.md:2:1: title: /u),
    ]);
  });

  it("points a cached file's slug error at its current line", async () => {
    const created = await createProject({
      "content/posts/a.md": "---\ntitle: A\nslug: same\n---\n",
      "content/posts/b.md": "---\ntitle: B\nslug: same\n---\n",
    });

    ({ cleanup } = created);
    const cache = new Map();

    await loadCollection("posts", posts, created.root, { cache });
    await created.write({
      "content/posts/b.md": "---\n\ntitle: B\nslug: same\n---\n",
    });

    const { errors } = await loadCollection("posts", posts, created.root, {
      cache,
    });

    expect(errors[0]).toMatchObject({ line: 4 });
  });

  it("warns when the directory is missing or nothing matches", async () => {
    const root = await project({ "content/posts/notes.txt": "text" });

    const missing = await loadCollection(
      "blogPosts",
      defineCollection({ ...posts, loader: directory("content/post") }),
      root
    );

    const empty = await loadCollection("posts", posts, root);

    expect([...missing.warnings, ...empty.warnings]).toStrictEqual([
      'blogPosts: directory "content/post" does not exist, so collections.get("blogPosts") is empty',
      'posts: no files in "content/posts" match "**/*.md", so collections.get("posts") is empty',
    ]);
  });

  it("fails on a slug used by two files, pointing at the one to change", async () => {
    const root = await project({
      "content/posts/a.md": "---\ntitle: A\nslug: same\n---\n",
      "content/posts/b.md": "---\ntitle: B\nslug: same\n---\n",
      "content/posts/same.md": "---\ntitle: Same\n---\n",
    });

    const { documents, errors } = await loadCollection("posts", posts, root);

    expect(documents.map((document) => document.slug)).toStrictEqual(["same"]);
    expect(messages(errors)).toStrictEqual([
      'content/posts/b.md:3:1: slug "same" is already used by content/posts/a.md. Change this file\'s `slug`',
      'content/posts/same.md: slug "same" is already used by content/posts/a.md. Rename this file, or set a different `slug` in its frontmatter',
    ]);
  });

  it("watches its include patterns and leaves its exclude patterns out", () => {
    expect(
      directory("content/posts", {
        exclude: "drafts/**",
        include: ["*.md", "**/*.mdx"],
      }).watch
    ).toStrictEqual([
      "content/posts/*.md",
      "content/posts/**/*.mdx",
      "!content/posts/drafts/**",
    ]);
  });
});
