import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { typeName, writeTypes } from "../src/generate";
import { createProject } from "./project";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});

async function project() {
  const created = await createProject({});
  ({ cleanup } = created);
  return created.root;
}

describe("typeName", () => {
  it("turns a collection key into a type name", () => {
    expect(typeName("posts")).toBe("Posts");
    expect(typeName("blogPosts")).toBe("BlogPosts");
    expect(typeName("case_studies")).toBe("CaseStudies");
  });
});

describe("writeTypes", () => {
  it("writes an index and one file per collection, with its slugs", async () => {
    const root = await project();
    const directory = path.join(root, ".tomekit");

    const changed = await writeTypes(
      directory,
      path.join(root, "tomekit.config.ts"),
      [
        { name: "posts", slugs: ["hello", "guides/setup"] },
        { name: "notes", slugs: [] },
      ]
    );

    const content = path.join(directory, "content");
    expect(changed).toBe(true);
    const written = await readdir(content);
    expect(written.toSorted()).toStrictEqual(["notes.d.ts", "posts.d.ts"]);
    const posts = await readFile(path.join(content, "posts.d.ts"), "utf-8");
    expect(posts).toContain('import type config from "../../tomekit.config";');
    expect(posts).toContain(
      'export type PostsSlug = "hello" | "guides/setup";'
    );
    expect(await readFile(path.join(content, "notes.d.ts"), "utf-8")).toContain(
      "export type NotesSlug = never;"
    );
    expect(posts).toContain(
      "declare const collection: _Collection<Posts, PostsSlug>;"
    );
    const index = await readFile(path.join(directory, "content.d.ts"), "utf-8");
    expect(index).toContain(
      '"posts": typeof import("./content/posts").default;'
    );
    expect(index).toContain("export type AnyDocument = Posts | Notes;");
  });

  it("reports no change when nothing differs, and removes dropped collections", async () => {
    const root = await project();
    const directory = path.join(root, ".tomekit");
    const configPath = path.join(root, "tomekit.config.ts");
    const posts = { name: "posts", slugs: ["hello"] };

    await writeTypes(directory, configPath, [
      posts,
      { name: "old", slugs: [] },
    ]);
    expect(
      await writeTypes(directory, configPath, [
        posts,
        { name: "old", slugs: [] },
      ])
    ).toBe(false);
    expect(await writeTypes(directory, configPath, [posts])).toBe(true);

    const remaining = await readdir(path.join(directory, "content"));
    expect(remaining).toStrictEqual(["posts.d.ts"]);
  });
});
