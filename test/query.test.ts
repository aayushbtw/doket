import { describe, expect, it } from "vite-plus/test";

import { createCollection } from "../src/query";

const collection = createCollection([
  ["b", { title: "Beta" }],
  ["a", { title: "Alpha" }],
] as const);

describe("createCollection", () => {
  it("keeps documents and slugs in entry order", () => {
    expect(collection.all.map((post) => post.title)).toStrictEqual([
      "Beta",
      "Alpha",
    ]);
    expect(collection.slugs).toStrictEqual(["b", "a"]);
  });

  it("finds a document by slug", () => {
    expect(collection.get("a")?.title).toBe("Alpha");
    expect(collection.get("missing")).toBeUndefined();
  });

  it("works when get is destructured", () => {
    const { get } = collection;
    expect(get("b")?.title).toBe("Beta");
  });
});
