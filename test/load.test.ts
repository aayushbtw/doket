import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { defineCollection } from "../src/index";
import { loadCollection } from "../src/load";
import { createProject } from "./project";

let cleanup: (() => Promise<void>) | undefined;
afterEach(() => cleanup?.());

const posts = defineCollection({
  directory: "content/posts",
  include: "**/*.md",
  name: "posts",
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

describe("loadCollection", () => {
  it("parses frontmatter, body and meta, in file name order", async () => {
    const root = await project({
      "content/posts/b.md":
        "---\ntitle: B\ntags:\n  - one\n  - two\n---\n\nBody of B\n",
      "content/posts/nested/a.md": "---\ntitle: A\n---\nBody of A",
    });

    const entries = await loadCollection(posts, root);

    expect(entries.map((entry) => entry.slug)).toStrictEqual(["b", "nested/a"]);
    expect(entries[0]?.output).toStrictEqual({
      _meta: { fileName: "b.md", filePath: "content/posts/b.md", slug: "b" },
      content: "\nBody of B\n",
      tags: ["one", "two"],
      title: "B",
    });
  });

  it("accepts a file with an empty or missing frontmatter block", async () => {
    const loose = defineCollection({
      directory: "content/posts",
      include: "*.md",
      name: "loose",
      schema: z.object({}),
    });
    const root = await project({
      "content/posts/empty.md": "---\n---\nOnly body",
      "content/posts/none.md": "No frontmatter",
    });

    const entries = await loadCollection(loose, root);

    expect(
      entries.map((entry) => (entry.output as { content: string }).content)
    ).toStrictEqual(["Only body", "No frontmatter"]);
  });

  it("runs the transform on the validated document", async () => {
    const root = await project({
      "content/posts/hello.md": "---\ntitle: Hello\n---\n",
    });
    const withUrl = defineCollection({
      ...posts,
      transform: (document) => ({
        title: document.title,
        url: `/posts/${document._meta.slug}`,
      }),
    });

    const entries = await loadCollection(withUrl, root);

    expect(entries[0]?.output).toStrictEqual({
      title: "Hello",
      url: "/posts/hello",
    });
  });

  it("names the file and field when validation fails", async () => {
    const root = await project({
      "content/posts/broken.md": "---\ntags: []\n---\n",
    });

    await expect(loadCollection(posts, root)).rejects.toThrow(
      /^content\/posts\/broken\.md: title: /u
    );
  });

  it("names the file when the frontmatter is not valid YAML", async () => {
    const root = await project({
      "content/posts/bad.md": "---\ntitle: [unclosed\n---\n",
    });

    await expect(loadCollection(posts, root)).rejects.toThrow(
      /^content\/posts\/bad\.md: /u
    );
  });
});
