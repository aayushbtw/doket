import { glob, readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { Skipped } from "./index";
import type { Collection, Document } from "./index";

const FRONTMATTER = /^---\r?\n(?:(?<data>[\s\S]*?)\r?\n)?---(?:\r?\n|$)/u;
const EXTENSION = /\.[^./]+$/u;

function skip(reason?: string): Skipped {
  return new Skipped(reason);
}

const RESERVED = ["content", "file"];

interface Entry {
  output: unknown;
  /** Computed before the transform, so lookups work whatever it returns. */
  slug: string;
}

/** Every kept document, in file name order. */
async function loadCollection(
  collection: Collection,
  root: string,
  warn: (message: string) => void = console.warn
): Promise<Entry[]> {
  const directory = path.resolve(root, collection.directory);
  const files: string[] = [];
  for await (const file of glob(collection.include, {
    cwd: directory,
    exclude:
      collection.exclude === undefined ? [] : [collection.exclude].flat(),
  })) {
    files.push(file);
  }
  files.sort();

  const entries = await Promise.all(
    files.map(async (file) => {
      const filePath = path.relative(root, path.join(directory, file));
      try {
        const document = await loadDocument(
          collection,
          directory,
          file,
          filePath,
          warn
        );
        const output = collection.transform
          ? await collection.transform(document, { skip })
          : document;
        return { output, slug: document.slug };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${filePath}: ${message}`, {
          cause: error,
        });
      }
    })
  );
  return entries.filter((entry) => !(entry.output instanceof Skipped));
}

async function loadDocument(
  collection: Collection,
  directory: string,
  file: string,
  filePath: string,
  warn: (message: string) => void
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

  for (const key of RESERVED) {
    if (key in value) {
      warn(`${filePath}: frontmatter "${key}" is reserved and was ignored`);
    }
  }

  const { slug } = value as { slug?: unknown };
  return {
    ...value,
    content: match ? source.slice(match[0].length) : source,
    file: { name: path.basename(file), path: filePath },
    slug:
      typeof slug === "string" && slug !== ""
        ? slug
        : file.split(path.sep).join("/").replace(EXTENSION, ""),
  };
}

export { type Entry, loadCollection };
