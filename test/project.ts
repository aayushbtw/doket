import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const TMP = path.join(import.meta.dirname, ".tmp");

/** A throwaway project inside the repo, so its files resolve this repo's node_modules. */
async function createProject(files: Record<string, string>) {
  await mkdir(TMP, { recursive: true });
  const root = await mkdtemp(path.join(TMP, "project-"));
  await writeFiles(root, files);
  return {
    cleanup: async () => {
      await rm(root, { force: true, recursive: true });
    },
    root,
    write: async (more: Record<string, string>) => {
      await writeFiles(root, more);
    },
  };
}

async function writeFiles(root: string, files: Record<string, string>) {
  await Promise.all(
    Object.entries(files).map(async ([file, source]) => {
      const target = path.join(root, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, source);
    })
  );
}

const SOURCE = path.join(import.meta.dirname, "..", "src", "index.ts");

export { createProject, SOURCE };
