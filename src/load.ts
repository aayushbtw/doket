import { createHash } from "node:crypto";
import { glob, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { Skipped } from "./index";
import type { CollectionConfig, Document } from "./index";
import { serialize } from "./serialize";

const FRONTMATTER = /^---\r?\n(?:(?<data>[\s\S]*?)\r?\n)?---(?:\r?\n|$)/u;
const EXTENSION = /\.[^./]+$/u;
const DEFAULT_INCLUDE = "**/*.md";
const RESERVED = ["content", "file"];

interface Entry {
  /** `output` as JavaScript source. */
  code: string;
  filePath: string;
  output: unknown;
  /** Computed before the transform, so lookups work whatever it returns. */
  slug: string;
}

/** A file's last result, reused while its source and the config are unchanged. */
type FileCache = Map<string, { entry: Entry; hash: string }>;

interface LoadOptions {
  /** Reused across loads of the same collection. */
  cache?: FileCache;
  /**
   * Receives a file that failed, which is then left out. Without it, the first
   * failure fails the whole load.
   */
  onError?: (error: Error) => void;
  warn?: (message: string) => void;
}

function skip(reason?: string): Skipped {
  return new Skipped(reason);
}

function includePatterns(collection: CollectionConfig): string[] {
  return [collection.include ?? DEFAULT_INCLUDE].flat();
}

function excludePatterns(collection: CollectionConfig): string[] {
  return collection.exclude === undefined ? [] : [collection.exclude].flat();
}

/** Whether a path relative to the collection directory belongs to it. */
function inCollection(collection: CollectionConfig, file: string): boolean {
  const posix = file.split(path.sep).join("/");
  return (
    includePatterns(collection).some((pattern) =>
      path.matchesGlob(posix, pattern)
    ) &&
    !excludePatterns(collection).some((pattern) =>
      path.matchesGlob(posix, pattern)
    )
  );
}

function hash(source: string): string {
  return createHash("sha1").update(source).digest("base64");
}

async function isDirectory(directory: string): Promise<boolean> {
  const stats = await stat(directory).catch(() => null);
  return stats?.isDirectory() ?? false;
}

/** Every kept document, in file name order. */
async function loadCollection(
  name: string,
  collection: CollectionConfig,
  root: string,
  { cache, onError, warn = console.warn }: LoadOptions = {}
): Promise<Entry[]> {
  const directory = path.resolve(root, collection.directory);
  if (!(await isDirectory(directory))) {
    warn(`${name}: directory "${collection.directory}" does not exist`);
    return [];
  }

  const files: string[] = [];
  for await (const file of glob(includePatterns(collection), {
    cwd: directory,
    exclude: excludePatterns(collection),
  })) {
    files.push(file);
  }
  files.sort();
  if (files.length === 0) {
    warn(
      `${name}: no files in "${collection.directory}" match ${JSON.stringify(collection.include ?? DEFAULT_INCLUDE)}`
    );
  }

  const results = await Promise.all(
    files.map(async (file) => {
      const filePath = path.relative(root, path.join(directory, file));
      try {
        return await loadFile(name, collection, directory, file, filePath, {
          cache,
          warn,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failure = new Error(`${filePath}: ${message}`, { cause: error });
        if (onError === undefined) {
          throw failure;
        }
        onError(failure);
        return null;
      }
    })
  );

  if (cache !== undefined) {
    const present = new Set(files);
    for (const file of cache.keys()) {
      if (!present.has(file)) {
        cache.delete(file);
      }
    }
  }

  const entries = results.filter(
    (entry): entry is Entry =>
      entry !== null && !(entry.output instanceof Skipped)
  );
  return withoutDuplicates(entries, onError);
}

function withoutDuplicates(
  entries: Entry[],
  onError: LoadOptions["onError"]
): Entry[] {
  const seen = new Map<string, Entry>();
  const kept: Entry[] = [];
  for (const entry of entries) {
    const first = seen.get(entry.slug);
    if (first === undefined) {
      seen.set(entry.slug, entry);
      kept.push(entry);
      continue;
    }
    const failure = new Error(
      `${entry.filePath}: slug "${entry.slug}" is already used by ${first.filePath}`
    );
    if (onError === undefined) {
      throw failure;
    }
    onError(failure);
  }
  return kept;
}

async function loadFile(
  name: string,
  collection: CollectionConfig,
  directory: string,
  file: string,
  filePath: string,
  { cache, warn }: { cache?: FileCache; warn: (message: string) => void }
): Promise<Entry> {
  const source = await readFile(path.join(directory, file), "utf-8");
  const sourceHash = hash(source);
  const cached = cache?.get(file);
  if (cached?.hash === sourceHash) {
    return cached.entry;
  }

  const document = await parseDocument(
    collection,
    source,
    file,
    filePath,
    warn
  );
  const output = collection.transform
    ? await collection.transform(document, { collection: name, skip })
    : document;
  if (
    typeof output === "object" &&
    output !== null &&
    "slug" in output &&
    output.slug !== document.slug
  ) {
    throw new Error(
      `transform changed slug "${document.slug}" to ${JSON.stringify(output.slug)}. Set \`slug\` in the frontmatter instead, so lookups and types agree.`
    );
  }
  // Inside the per-file try, so a value that cannot be written names its file.
  const code = output instanceof Skipped ? "" : serialize(output);
  const entry = { code, filePath, output, slug: document.slug };
  cache?.set(file, { entry, hash: sourceHash });
  return entry;
}

async function parseDocument(
  collection: CollectionConfig,
  source: string,
  file: string,
  filePath: string,
  warn: (message: string) => void
): Promise<Document<CollectionConfig["schema"]>> {
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

  const slug = "slug" in value ? value.slug : undefined;
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

export { type Entry, type FileCache, inCollection, loadCollection };
