import path from "node:path";

import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import type { StandardSchema } from "../src/index";
import { parse } from "../src/parse";

const titled = z.object({ title: z.string() });

interface ParseOptions {
  file?: string;
  schema?: StandardSchema;
}

async function parseSource(
  source: string,
  { file = "hello.md", schema = titled }: ParseOptions = {}
) {
  return await parse({
    file,
    filePath: path.join("content/posts", file),
    schema,
    source,
  });
}

describe("parse", () => {
  it("reads frontmatter and body written with CRLF line endings", async () => {
    const result = await parseSource("---\r\ntitle: Hello\r\n---\r\nBody");

    expect(result).toMatchObject({
      document: { content: "Body", title: "Hello" },
    });
  });

  it("slugs a nested file by its path without the extension", async () => {
    const result = await parseSource("---\ntitle: Setup\n---\n", {
      file: path.join("guides", "setup.draft.md"),
    });

    expect(result).toMatchObject({
      document: {
        file: { name: "setup.draft.md" },
        slug: "guides/setup.draft",
      },
    });
  });

  it("falls back to the file name for an empty frontmatter slug", async () => {
    const result = await parseSource('---\ntitle: Hello\nslug: ""\n---\n', {
      schema: z.object({ slug: z.string(), title: z.string() }),
    });

    expect(result).toMatchObject({ document: { slug: "hello" } });
  });

  it("leaves line and column out when there is no frontmatter", async () => {
    const { issues = [] } = await parseSource("Just a body");

    expect(issues).toHaveLength(1);
    expect(Object.keys(issues[0] ?? {})).toStrictEqual(["message"]);
    expect(issues[0]?.message).toMatch(/^title: /u);
  });

  it("points a missing nested key at its deepest parent", async () => {
    const { issues = [] } = await parseSource(
      "---\ntitle: A\nmeta:\n  tags: []\n---\n",
      {
        schema: z.object({
          meta: z.object({ author: z.string() }),
          title: z.string(),
        }),
      }
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ column: 1, line: 3 });
    expect(issues[0]?.message).toMatch(/^meta\.author: /u);
  });

  it("points an issue about the whole frontmatter at its first line", async () => {
    const result = await parseSource("---\ntitle: A\n---\n", {
      schema: titled.refine(() => false, "needs a date or a draft flag"),
    });

    expect(result).toStrictEqual({
      issues: [{ column: 1, line: 2, message: "needs a date or a draft flag" }],
    });
  });

  it("fails when the schema does not produce an object", async () => {
    const result = await parseSource("---\ntitle: A\n---\n", {
      schema: titled.transform((data) => data.title),
    });

    expect(result).toStrictEqual({
      issues: [{ message: "the schema must produce an object" }],
    });
  });
});
