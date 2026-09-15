import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { writeTypes } from "../src/generate";
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

describe("writeTypes", () => {
  it("writes one file with every collection's name and slugs", async () => {
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

    expect(changed).toBe(true);
    expect(await readdir(directory)).toStrictEqual(["content.d.ts"]);
    const types = await readFile(path.join(directory, "content.d.ts"), "utf-8");
    expect(types).toContain('import type config from "../tomekit.config";');
    expect(types).toContain('export type CollectionName = "posts" | "notes";');
    expect(types).toContain('  "posts": "hello" | "guides/setup";');
    expect(types).toContain('  "notes": never;');
    expect(types).toContain("export declare const collections: {");
  });

  it("exports the same names as the tomekit/content fallback", async () => {
    const root = await project();
    const directory = path.join(root, ".tomekit");

    await writeTypes(directory, path.join(root, "tomekit.config.ts"), [
      { name: "posts", slugs: [] },
    ]);

    const generated = await readFile(
      path.join(directory, "content.d.ts"),
      "utf-8"
    );

    const fallback = await readFile(
      path.join(import.meta.dirname, "..", "src", "content.ts"),
      "utf-8"
    );

    const generatedNames = [
      ...generated.matchAll(/^export (?:type|declare const) (\w+)/gmu),
    ].map(([, name]) => name ?? "");

    const fallbackNames = (
      /^export \{(?<names>[^}]*)\}/mu.exec(fallback)?.groups?.names ?? ""
    )
      .split(",")
      .map((name) => name.replace(/^\s*type\s+/u, "").trim())
      .filter((name) => name !== "");

    function byName(left: string, right: string) {
      return left.localeCompare(right);
    }

    expect(generatedNames.toSorted(byName)).toStrictEqual(
      fallbackNames.toSorted(byName)
    );
  });

  it("writes nothing when the types are unchanged", async () => {
    const root = await project();
    const directory = path.join(root, ".tomekit");
    const configPath = path.join(root, "tomekit.config.ts");
    const posts = { name: "posts", slugs: ["hello"] };

    await writeTypes(directory, configPath, [posts]);

    expect(await writeTypes(directory, configPath, [posts])).toBe(false);
    expect(
      await writeTypes(directory, configPath, [
        { name: "posts", slugs: ["hello", "later"] },
      ])
    ).toBe(true);
  });
});
