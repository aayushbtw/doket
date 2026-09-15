import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { configIssues } from "../src/config";
import { defineCollection, directory } from "../src/index";

const collection = defineCollection({
  loader: directory("content"),
  schema: z.object({}),
});

function issues(...names: string[]) {
  return configIssues({
    collections: Object.fromEntries(names.map((name) => [name, collection])),
  });
}

describe("configIssues", () => {
  it("accepts letters, digits and underscores that start with a letter", () => {
    expect(
      issues("posts", "blogPosts", "case_studies", "v2", "index")
    ).toStrictEqual([]);
  });

  it("rejects any other collection name", () => {
    expect(
      issues("2026", "a/b", "a-b", "a b", "a$b", "a.b", "_drafts")
    ).toStrictEqual(
      ["2026", "a/b", "a-b", "a b", "a$b", "a.b", "_drafts"].map(
        (name) =>
          `collection ${JSON.stringify(name)} has an invalid name. Use letters, digits and "_", starting with a letter, eg "blogPosts".`
      )
    );
  });

  it("names the loader a collection without one needs", () => {
    const { loader: _loader, ...withoutLoader } = collection;

    expect(
      // @ts-expect-error a JavaScript config, or one from before loaders, can leave it out
      configIssues({ collections: { posts: withoutLoader } })
    ).toStrictEqual([
      'collection "posts" has no loader. Set one, eg `loader: directory("content/posts")`.',
    ]);
  });

  it("accepts references between collections in the config", () => {
    expect(
      configIssues({
        collections: { authors: collection, posts: collection },
        references: {
          authors: { mentor: "authors" },
          posts: { author: "authors", "sections.author": "authors" },
        },
      })
    ).toStrictEqual([]);
  });

  it("names the collection or key path a reference gets wrong", () => {
    expect(
      configIssues({
        collections: { authors: collection, posts: collection },
        references: {
          drafts: { author: "authors" },
          posts: { "": "authors", "a..b": "authors", author: "autors" },
        },
      })
    ).toStrictEqual([
      'references.drafts: there is no collection "drafts". Use one of "authors", "posts".',
      'references.posts[""] is not a key path. Separate keys with ".", eg "sections.author".',
      'references.posts["a..b"] is not a key path. Separate keys with ".", eg "sections.author".',
      'references.posts["author"] must name a collection, got "autors". Use one of "authors", "posts".',
    ]);
  });

  it("rejects references that are not objects, for a JavaScript config", () => {
    expect(
      configIssues({
        collections: { posts: collection },
        // @ts-expect-error a JavaScript config can set anything
        references: "posts",
      })
    ).toStrictEqual([
      'references must be an object keyed by collection name, eg `references: { posts: { author: "authors" } }`.',
    ]);

    expect(
      configIssues({
        collections: { posts: collection },
        // @ts-expect-error a JavaScript config can set anything
        references: { posts: "posts" },
      })
    ).toStrictEqual([
      'references.posts must be an object from key path to collection name, eg `{ author: "authors" }`.',
    ]);

    expect(
      configIssues({
        collections: { posts: collection },
        // @ts-expect-error a JavaScript config can set anything
        references: { posts: { author: 1 } },
      })
    ).toStrictEqual([
      'references.posts["author"] must name a collection, got 1. Use one of "posts".',
    ]);
  });
});
