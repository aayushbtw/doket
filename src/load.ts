import { glob, readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import type { Collection, Document } from "./index";

const FRONTMATTER = /^---\r?\n(?:(?<data>[\s\S]*?)\r?\n)?---(?:\r?\n|$)/u;
const EXTENSION = /\.[^./]+$/u;

interface LoadedEntry {
  output: unknown;
  slug: string;
}

async function loadCollection(
  collection: Collection,
  root: string
): Promise<LoadedEntry[]> {
  const directory = path.resolve(root, collection.directory);
  const files: string[] = [];
  for await (const file of glob(collection.include, { cwd: directory })) {
    files.push(file);
  }
  files.sort();

  return await Promise.all(
    files.map(async (file) => {
      const filePath = path.relative(root, path.join(directory, file));
      try {
        const document = await loadDocument(
          collection,
          directory,
          file,
          filePath
        );
        const output = collection.transform
          ? await collection.transform(document)
          : document;
        return { output, slug: document._meta.slug };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${filePath}: ${message}`, {
          cause: error,
        });
      }
    })
  );
}

async function loadDocument(
  collection: Collection,
  directory: string,
  file: string,
  filePath: string
): Promise<Document<Collection["schema"]>> {
  const source = await readFile(path.join(directory, file), "utf-8");
  const match = FRONTMATTER.exec(source);
  const frontmatter = match?.groups?.data;
  const data: unknown =
    frontmatter === undefined ? {} : (parseYaml(frontmatter) ?? {});

  const result = await collection.schema["~standard"].validate(data);
  if (result.issues) {
    throw new Error(
      result.issues
        .map((issue) => {
          const key = issue.path
            ?.map((part) => (typeof part === "object" ? part.key : part))
            .join(".");
          return key === undefined || key === ""
            ? issue.message
            : `${key}: ${issue.message}`;
        })
        .join("; ")
    );
  }

  const { value } = result;
  if (typeof value !== "object" || value === null) {
    throw new Error("the schema must produce an object");
  }

  return {
    ...value,
    _meta: {
      fileName: path.basename(file),
      filePath,
      slug: file.split(path.sep).join("/").replace(EXTENSION, ""),
    },
    content: match ? source.slice(match[0].length) : source,
  };
}

export { loadCollection };
