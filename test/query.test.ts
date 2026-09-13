import { describe, expect, it } from "vite-plus/test";

import { createCollection } from "../src/query";

interface Post {
  date: Date;
  draft?: boolean;
  rank: number;
  slug: string;
  tags: string[];
  title: string;
}

const posts: Post[] = [
  {
    date: new Date("2026-03-01"),
    rank: 2,
    slug: "b",
    tags: ["vite"],
    title: "Beta",
  },
  {
    date: new Date("2026-01-01"),
    draft: true,
    rank: 1,
    slug: "a",
    tags: ["react", "vite"],
    title: "Alpha",
  },
  {
    date: new Date("2026-02-01"),
    rank: 3,
    slug: "c",
    tags: [],
    title: "Gamma",
  },
];

const collection = createCollection(
  posts.map((post) => [post.slug, post] as const)
);

function titles(documents: Post[]) {
  return documents.map((post) => post.title);
}

describe("findMany", () => {
  it("returns every document in file order with no arguments", () => {
    expect(titles(collection.findMany())).toStrictEqual([
      "Beta",
      "Alpha",
      "Gamma",
    ]);
  });

  it("returns a new array each time", () => {
    const first = collection.findMany();
    first.pop();
    expect(collection.findMany()).toHaveLength(3);
  });

  it("filters by equality, including dates", () => {
    expect(
      titles(collection.findMany({ where: { draft: true } }))
    ).toStrictEqual(["Alpha"]);
    expect(
      titles(collection.findMany({ where: { date: new Date("2026-02-01") } }))
    ).toStrictEqual(["Gamma"]);
  });

  it("filters with operators", () => {
    expect(
      titles(collection.findMany({ where: { tags: { has: "vite" } } }))
    ).toStrictEqual(["Beta", "Alpha"]);
    expect(
      titles(
        collection.findMany({ where: { title: { in: ["Alpha", "Gamma"] } } })
      )
    ).toStrictEqual(["Alpha", "Gamma"]);
    expect(
      titles(collection.findMany({ where: { title: { notIn: ["Alpha"] } } }))
    ).toStrictEqual(["Beta", "Gamma"]);
    expect(
      titles(collection.findMany({ where: { title: { contains: "mm" } } }))
    ).toStrictEqual(["Gamma"]);
    expect(
      titles(
        collection.findMany({
          where: { title: { endsWith: "a", startsWith: "B" } },
        })
      )
    ).toStrictEqual(["Beta"]);
    expect(
      titles(collection.findMany({ where: { rank: { gt: 1, lte: 2 } } }))
    ).toStrictEqual(["Beta"]);
    expect(
      titles(
        collection.findMany({
          where: { date: { gte: new Date("2026-02-01") } },
        })
      )
    ).toStrictEqual(["Beta", "Gamma"]);
    expect(
      titles(collection.findMany({ where: { draft: { not: true } } }))
    ).toStrictEqual(["Beta", "Gamma"]);
  });

  it("negates with NOT and accepts a function", () => {
    expect(
      titles(collection.findMany({ where: { NOT: { tags: { has: "vite" } } } }))
    ).toStrictEqual(["Gamma"]);
    expect(
      titles(collection.findMany({ where: (post) => post.tags.length === 2 }))
    ).toStrictEqual(["Alpha"]);
  });

  it("orders by one or several fields, with missing values last", () => {
    expect(
      titles(collection.findMany({ orderBy: { date: "desc" } }))
    ).toStrictEqual(["Beta", "Gamma", "Alpha"]);
    expect(
      titles(collection.findMany({ orderBy: { title: "asc" } }))
    ).toStrictEqual(["Alpha", "Beta", "Gamma"]);
    expect(
      titles(
        collection.findMany({ orderBy: [{ draft: "desc" }, { rank: "desc" }] })
      )
    ).toStrictEqual(["Alpha", "Gamma", "Beta"]);
  });

  it("pages with skip and take after filtering and ordering", () => {
    expect(
      titles(
        collection.findMany({ orderBy: { rank: "asc" }, skip: 1, take: 1 })
      )
    ).toStrictEqual(["Beta"]);
    expect(titles(collection.findMany({ take: 2 }))).toStrictEqual([
      "Beta",
      "Alpha",
    ]);
  });
});

describe("findFirst, findUnique and count", () => {
  it("finds the first match after ordering", () => {
    expect(collection.findFirst({ orderBy: { rank: "desc" } })?.title).toBe(
      "Gamma"
    );
    expect(
      collection.findFirst({ where: { title: "Missing" } })
    ).toBeUndefined();
  });

  it("finds by slug", () => {
    expect(collection.findUnique({ slug: "a" })?.title).toBe("Alpha");
    expect(collection.findUnique({ slug: "missing" })).toBeUndefined();
  });

  it("counts matches", () => {
    expect(collection.count()).toBe(3);
    expect(collection.count({ where: { tags: { has: "vite" } } })).toBe(2);
  });
});
