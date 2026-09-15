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
});
