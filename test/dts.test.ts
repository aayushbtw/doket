import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { declaration, writeDeclaration } from "../src/dts";
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

describe("declaration", () => {
  it("imports the config relative to the declaration file", () => {
    expect(
      declaration("/app/tomekit.config.ts", "/app/tomekit-env.d.ts")
    ).toContain('import type config from "./tomekit.config";');
    expect(
      declaration("/app/tomekit.config.ts", "/app/src/tomekit-env.d.ts")
    ).toContain('import type config from "../tomekit.config";');
    expect(
      declaration("/app/config/content.mts", "/app/tomekit-env.d.ts")
    ).toContain('import type config from "./config/content";');
  });
});

describe("writeDeclaration", () => {
  it("writes a missing file, then leaves an identical one alone", async () => {
    const root = await project();
    const configPath = path.join(root, "tomekit.config.ts");
    const dtsPath = path.join(root, "tomekit-env.d.ts");

    expect(await writeDeclaration(configPath, dtsPath)).toBe(true);
    expect(await readFile(dtsPath, "utf-8")).toBe(
      declaration(configPath, dtsPath)
    );
    expect(await writeDeclaration(configPath, dtsPath)).toBe(false);
  });

  it("updates its own file when the config moves", async () => {
    const root = await project();
    const dtsPath = path.join(root, "tomekit-env.d.ts");
    await writeDeclaration(path.join(root, "tomekit.config.ts"), dtsPath);

    const moved = path.join(root, "content.config.ts");
    expect(await writeDeclaration(moved, dtsPath)).toBe(true);
    expect(await readFile(dtsPath, "utf-8")).toContain(
      'from "./content.config"'
    );
  });

  it("never overwrites a file edited by hand", async () => {
    const root = await project();
    const dtsPath = path.join(root, "tomekit-env.d.ts");
    await writeFile(dtsPath, "// mine\n");

    expect(
      await writeDeclaration(path.join(root, "tomekit.config.ts"), dtsPath)
    ).toBe(false);
    expect(await readFile(dtsPath, "utf-8")).toBe("// mine\n");
  });
});
