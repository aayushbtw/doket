import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { loadCollection } from "../src/collection";
import type { EntryCache } from "../src/collection";
import {
  TransformResultError,
  UnknownTransformFieldError,
  UnserializableValueError,
} from "../src/errors";
import { defineCollection } from "../src/index";
import type { CollectionConfig, Entry, Loader, LoadResult } from "../src/index";
import { LOCATE } from "../src/parse";
import type { LocatedEntry } from "../src/parse";

const ROOT = "/project";

const FILE = { name: "hello.md", path: "content/posts/hello.md" };

function loader(
  entries: readonly Entry[],
  rest: Omit<LoadResult, "entries"> = {}
): Loader {
  return { load: () => ({ entries, ...rest }) };
}

const schema = z.object({
  tags: z.array(z.string()).default([]),
  title: z.string(),
});

function posts(entries: readonly Entry[]) {
  return defineCollection({ loader: loader(entries), schema });
}

const hello: Entry = {
  body: "Text",
  file: FILE,
  metadata: { title: "Hello" },
  slug: "hello",
};

function outputs(documents: { output: unknown }[]) {
  return documents.map((document) => document.output);
}

function messages(errors: readonly Error[]) {
  return errors.map((error) => error.message);
}

describe("loadCollection", () => {
  it("builds documents in the loader's order, with or without a file", async () => {
    const { documents } = await loadCollection(
      "posts",
      posts([hello, { metadata: { title: "Code" }, slug: "code" }]),
      ROOT
    );

    expect(outputs(documents)).toStrictEqual([
      {
        body: "Text",
        file: FILE,
        metadata: { tags: [], title: "Hello" },
        slug: "hello",
      },
      {
        body: "",
        file: undefined,
        metadata: { tags: [], title: "Code" },
        slug: "code",
      },
    ]);
    expect(documents.map((document) => document.file)).toStrictEqual([
      "content/posts/hello.md",
      undefined,
    ]);
  });

  it("passes the collection name and root to the loader", async () => {
    const seen: unknown[] = [];

    const recorded = defineCollection({
      loader: {
        load: (context) => {
          seen.push(context);

          return { entries: [] };
        },
      },
      schema,
    });

    await loadCollection("posts", recorded, ROOT);

    expect(seen).toStrictEqual([{ collection: "posts", root: ROOT }]);
  });

  it("passes the loader's warnings and issues on", async () => {
    const { errors, warnings } = await loadCollection(
      "posts",
      defineCollection({
        loader: loader([], {
          issues: [
            { column: 3, file: "a.md", line: 2, message: "bad YAML" },
            { message: "no such page", slug: "missing" },
          ],
          warnings: ["posts: the API is slow"],
        }),
        schema,
      }),
      ROOT
    );

    expect(warnings).toStrictEqual(["posts: the API is slow"]);
    expect(messages(errors)).toStrictEqual([
      "a.md:2:3: bad YAML",
      'collections.get("posts").get("missing"): no such page',
    ]);
  });

  it("fails the collection when the loader throws or returns something else", async () => {
    const thrown = await loadCollection(
      "posts",
      defineCollection({
        loader: {
          load: () => {
            throw new Error("API is down");
          },
        },
        schema,
      }),
      ROOT
    );

    const array = await loadCollection(
      "posts",
      defineCollection({
        // @ts-expect-error a JavaScript config can return an array, so the check that runs is the one at build time
        loader: { load: () => [] },
        schema,
      }),
      ROOT
    );

    expect(messages([...thrown.errors, ...array.errors])).toStrictEqual([
      'collections.get("posts"): the loader failed: API is down',
      'collections.get("posts"): the loader\'s `load` must return an object with an `entries` array, eg `{ entries: [] }`',
    ]);
  });

  it("names the entry of a schema issue, at its position when it has one", async () => {
    const located: LocatedEntry = {
      [LOCATE]: () => ({ column: 1, line: 2 }),
      file: FILE,
      metadata: { title: 1 },
      slug: "hello",
    };

    const { errors } = await loadCollection(
      "posts",
      posts([{ slug: "code" }, located]),
      ROOT
    );

    expect(messages(errors)).toStrictEqual([
      expect.stringMatching(
        /^collections\.get\("posts"\)\.get\("code"\): title: /u
      ),
      expect.stringMatching(/^content\/posts\/hello\.md:2:1: title: /u),
    ]);
  });

  it("fails on a slug that is not a non-empty string", async () => {
    const { errors } = await loadCollection(
      "posts",
      posts([
        { slug: "" },
        // @ts-expect-error a JavaScript loader can return any slug, so the check that runs is the one at build time
        { slug: 1 },
      ]),
      ROOT
    );

    expect(messages(errors)).toStrictEqual([
      'collections.get("posts"): slug must be a non-empty string, got ""',
      'collections.get("posts"): slug must be a non-empty string, got 1',
    ]);
  });

  it("fails on a slug returned twice", async () => {
    const { documents, errors } = await loadCollection(
      "posts",
      posts([
        { metadata: { title: "A" }, slug: "same" },
        { metadata: { title: "B" }, slug: "same" },
      ]),
      ROOT
    );

    expect(outputs(documents)).toMatchObject([{ metadata: { title: "A" } }]);
    expect(messages(errors)).toStrictEqual([
      'collections.get("posts").get("same"): slug "same" is already used by another entry. Return a unique slug from the loader',
    ]);
  });

  it("replaces only the metadata a transform returns", async () => {
    const titleOnly = defineCollection({
      loader: loader([hello]),
      schema,
      transform: ({ metadata }) => ({ metadata: { title: metadata.title } }),
    });

    const { documents } = await loadCollection("posts", titleOnly, ROOT);

    expect(outputs(documents)).toStrictEqual([
      { body: "Text", file: FILE, metadata: { title: "Hello" }, slug: "hello" },
    ]);
    expect(documents[0]?.code).toMatch(/^JSON\.parse\(/u);
  });

  it("replaces only the body a transform returns", async () => {
    const loud = defineCollection({
      loader: loader([hello]),
      schema,
      transform: ({ body }) => ({ body: body.toUpperCase() }),
    });

    const { documents } = await loadCollection("posts", loud, ROOT);

    expect(outputs(documents)).toMatchObject([
      { body: "TEXT", metadata: { title: "Hello" } },
    ]);
  });

  it("leaves out entries the transform skips", async () => {
    const published = defineCollection({
      loader: loader([
        { metadata: { tags: ["draft"], title: "Draft" }, slug: "draft" },
        { metadata: { title: "Live" }, slug: "live" },
      ]),
      schema,
      transform: ({ metadata }, { skip }) =>
        metadata.tags.includes("draft") ? skip("draft") : {},
    });

    const { documents } = await loadCollection("posts", published, ROOT);

    expect(outputs(documents)).toMatchObject([{ metadata: { title: "Live" } }]);
  });

  it("passes the collection name to the transform", async () => {
    const withUrl = defineCollection({
      loader: loader([hello]),
      schema,
      transform: ({ metadata, slug }, { collection }) => ({
        metadata: { ...metadata, url: `/${collection}/${slug}` },
      }),
    });

    const { documents } = await loadCollection("posts", withUrl, ROOT);

    expect(outputs(documents)).toMatchObject([
      { metadata: { url: "/posts/hello" } },
    ]);
  });

  it("fails when a transform returns a field documents do not have", async () => {
    // Typed loosely, as JavaScript config would be, so the check that runs is the one at build time.
    const extraField: CollectionConfig = {
      loader: loader([hello]),
      schema,
      transform: () => ({ url: "/posts/hello" }),
    };

    const { documents, errors } = await loadCollection(
      "posts",
      extraField,
      ROOT
    );

    expect(documents).toStrictEqual([]);
    expect(errors[0]?.cause).toBeInstanceOf(UnknownTransformFieldError);
    expect(messages(errors)[0]).toBe(
      'content/posts/hello.md: transform returned "url", but it can only return `metadata` and `body`. Put derived values inside `metadata` instead.'
    );
  });

  it("fails when a transform returns something other than an object", async () => {
    const text: CollectionConfig = {
      loader: loader([hello]),
      schema,
      transform: () => "hello",
    };

    const { errors } = await loadCollection("posts", text, ROOT);

    expect(errors[0]?.cause).toBeInstanceOf(TransformResultError);
  });

  it("names the entry and key of a value that cannot be written", async () => {
    class Author {
      name = "Ada";
    }

    const withClass = defineCollection({
      loader: loader([
        hello,
        { metadata: { author: new Author() }, slug: "b" },
      ]),
      schema: z.looseObject({}),
      transform: () => ({ metadata: { list: [new Author()] } }),
    });

    const { errors } = await loadCollection("posts", withClass, ROOT);

    expect(errors.map((error) => error.cause)).toStrictEqual([
      expect.any(UnserializableValueError),
      expect.any(UnserializableValueError),
    ]);
    expect(messages(errors)).toStrictEqual([
      expect.stringMatching(
        /^content\/posts\/hello\.md: cannot write an instance of Author at metadata\.list\[0\] into content/u
      ),
      expect.stringMatching(
        /^collections\.get\("posts"\)\.get\("b"\): cannot write an instance of Author at author/u
      ),
    ]);
  });

  it("reruns the transform only for entries that changed", async () => {
    let entries: Entry[] = [
      { metadata: { title: "A" }, slug: "a" },
      { metadata: { title: "B" }, slug: "b" },
    ];

    const transformed: string[] = [];

    const counted = defineCollection({
      loader: { load: () => ({ entries }) },
      schema,
      transform: ({ metadata, slug }) => {
        transformed.push(slug);

        return { metadata: { title: metadata.title } };
      },
    });

    const cache: EntryCache = new Map();

    await loadCollection("posts", counted, ROOT, { cache });
    entries = [
      { metadata: { title: "A" }, slug: "a" },
      { metadata: { title: "B2" }, slug: "b" },
    ];

    const { documents } = await loadCollection("posts", counted, ROOT, {
      cache,
    });

    // Entries load in parallel, so only which ones reran is stable, not their order.
    expect(transformed.toSorted()).toStrictEqual(["a", "b", "b"]);
    expect(outputs(documents)).toMatchObject([
      { metadata: { title: "A" } },
      { metadata: { title: "B2" } },
    ]);
  });
});
