import { describe, expect, it } from "vite-plus/test";

import { createCollection, createCollections } from "../src/query";

const collection = createCollection([
  ["b", { title: "Beta" }],
  ["a", { title: "Alpha" }],
]);

describe("createCollection", () => {
  it("keeps documents and slugs in the order given", () => {
    expect(collection.documents().map((post) => post.title)).toStrictEqual([
      "Beta",
      "Alpha",
    ]);
    expect(collection.slugs()).toStrictEqual(["b", "a"]);
  });

  it("finds and checks a document by slug", () => {
    expect(collection.get("a")?.title).toBe("Alpha");
    expect(collection.get("missing")).toBeUndefined();
    expect(collection.has("a")).toBe(true);
    expect(collection.has("missing")).toBe(false);
  });

  it("works when its members are destructured", () => {
    const { documents, get, has, slugs } = collection;
    expect(get("b")?.title).toBe("Beta");
    expect(has("b")).toBe(true);
    expect([documents().length, slugs().length]).toStrictEqual([2, 2]);
  });
});

describe("createCollections", () => {
  const collections = createCollections({
    notes: createCollection([
      ["a", { title: "A" }],
      ["b", { title: "B" }],
    ]),
    posts: createCollection([["hello", { title: "Hello" }]]),
  });

  it("lists collection names in config order", () => {
    expect(collections.names()).toStrictEqual(["notes", "posts"]);
  });

  it("finds and checks a collection by name, and nothing for other strings", () => {
    expect(collections.get("posts")?.get("hello")?.title).toBe("Hello");
    expect(collections.has("posts")).toBe(true);
    expect(collections.get("drafts")).toBeUndefined();
    expect(collections.get("toString")).toBeUndefined();
    expect(collections.has("toString")).toBe(false);
  });
});
