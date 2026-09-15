import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { LOCATE, parse } from "../src/parse";

function parseText(text: string, file = "hello.md") {
  return parse({ file, filePath: path.join("content/posts", file), text });
}

function entryOf(text: string, file?: string) {
  const result = parseText(text, file);

  if (result.entry === undefined || result.issues.length > 0) {
    throw new Error(`expected an entry, got ${JSON.stringify(result.issues)}`);
  }

  return result.entry;
}

describe("parse", () => {
  it("reads frontmatter and body written with CRLF line endings", () => {
    expect(entryOf("---\r\ntitle: Hello\r\n---\r\nBody")).toMatchObject({
      body: "Body",
      metadata: { title: "Hello" },
    });
  });

  it("slugs a nested file by its path without the extension", () => {
    const entry = entryOf(
      "---\ntitle: Setup\n---\n",
      path.join("guides", "setup.draft.md")
    );

    expect(entry).toMatchObject({
      file: { name: "setup.draft.md" },
      slug: "guides/setup.draft",
    });
  });

  it("reads a frontmatter slug and keeps it in the metadata", () => {
    expect(entryOf("---\ntitle: Hello\nslug: hi\n---\n")).toMatchObject({
      metadata: { slug: "hi", title: "Hello" },
      slug: "hi",
    });
  });

  it.each(['""', "42", ""])(
    "reports a frontmatter slug of %j and falls back to the file path",
    (slug) => {
      expect(
        parseText(`---\ntitle: Hello\nslug: ${slug}\n---\n`)
      ).toMatchObject({
        entry: { slug: "hello" },
        issues: [
          {
            column: 1,
            line: 3,
            message:
              'slug: must be a non-empty string, eg "hello-world". Remove it to use the file path instead',
          },
        ],
      });
    }
  );

  it("points at the YAML that does not parse", () => {
    expect(parseText("---\ntitle: [unclosed\n---\n")).toMatchObject({
      entry: undefined,
      issues: [{ column: 17, line: 2 }],
    });
  });

  it("has no positions when there is no frontmatter", () => {
    const entry = entryOf("Just a body");

    expect(entry.metadata).toStrictEqual({});
    expect(entry[LOCATE](["title"])).toBeUndefined();
  });

  it("locates a missing nested key at its deepest parent", () => {
    const entry = entryOf("---\ntitle: A\nmeta:\n  tags: []\n---\n");

    expect(entry[LOCATE](["meta", "author"])).toStrictEqual({
      column: 1,
      line: 3,
    });
  });

  it("locates the whole frontmatter at its first line", () => {
    expect(entryOf("---\ntitle: A\n---\n")[LOCATE]([])).toStrictEqual({
      column: 1,
      line: 2,
    });
  });
});
