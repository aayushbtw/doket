import { createHash } from "node:crypto";
import { glob, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { Skipped } from "./index";
import type { CollectionConfig } from "./index";
import { parse } from "./parse";
import type { Issue, ParseResult } from "./parse";
import { serialize } from "./serialize";

const DEFAULT_INCLUDE = "**/*.md";

/** A problem with one content file, printed as `file:line:column: message`. */
class ContentError extends Error {
  readonly column: number | undefined;
  /** Relative to the project root. */
  readonly file: string;
  readonly line: number | undefined;

  constructor(file: string, issue: Issue, options?: ErrorOptions) {
    const location = [file, issue.line, issue.column]
      .filter((part) => part !== undefined)
      .join(":");
    super(`${location}: ${issue.message}`, options);
    this.name = "ContentError";
    this.column = issue.column;
    this.file = file;
    this.line = issue.line;
  }
}

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

interface CollectionResult {
  /** Every kept document, in file name order. Broken files are left out. */
  entries: Entry[];
  errors: ContentError[];
  warnings: string[];
}

type FileResult =
  | { entry: Entry; errors?: undefined; warnings: string[] }
  | { errors: ContentError[] };

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

function skip(reason?: string): Skipped {
  return new Skipped(reason);
}

function hash(source: string): string {
  return createHash("sha1").update(source).digest("base64");
}

async function isDirectory(directory: string): Promise<boolean> {
  const stats = await stat(directory).catch(() => null);
  return stats?.isDirectory() ?? false;
}

async function loadCollection(
  name: string,
  collection: CollectionConfig,
  root: string,
  { cache }: { cache?: FileCache } = {}
): Promise<CollectionResult> {
  const directory = path.resolve(root, collection.directory);
  if (!(await isDirectory(directory))) {
    return {
      entries: [],
      errors: [],
      warnings: [
        `${name}: directory "${collection.directory}" does not exist, so content.${name} is empty`,
      ],
    };
  }

  const files: string[] = [];
  for await (const file of glob(includePatterns(collection), {
    cwd: directory,
    exclude: excludePatterns(collection),
  })) {
    files.push(file);
  }
  files.sort();

  const warnings: string[] = [];
  if (files.length === 0) {
    warnings.push(
      `${name}: no files in "${collection.directory}" match ${JSON.stringify(collection.include ?? DEFAULT_INCLUDE)}, so content.${name} is empty`
    );
  }

  const results = await Promise.all(
    files.map(
      async (file) =>
        await loadFile(name, collection, file, {
          cache,
          filePath: path.relative(root, path.join(directory, file)),
          source: path.join(directory, file),
        })
    )
  );

  if (cache !== undefined) {
    const present = new Set(files);
    for (const file of cache.keys()) {
      if (!present.has(file)) {
        cache.delete(file);
      }
    }
  }

  const errors: ContentError[] = [];
  const bySlug = new Map<string, Entry>();
  const entries: Entry[] = [];
  for (const result of results) {
    if (result.errors) {
      errors.push(...result.errors);
      continue;
    }
    warnings.push(...result.warnings);
    const { entry } = result;
    if (entry.output instanceof Skipped) {
      continue;
    }
    const first = bySlug.get(entry.slug);
    if (first !== undefined) {
      errors.push(
        new ContentError(entry.filePath, {
          message: `slug "${entry.slug}" is already used by ${first.filePath}`,
        })
      );
      continue;
    }
    bySlug.set(entry.slug, entry);
    entries.push(entry);
  }
  return { entries, errors, warnings };
}

async function loadFile(
  name: string,
  collection: CollectionConfig,
  file: string,
  {
    cache,
    filePath,
    source: sourcePath,
  }: { cache?: FileCache; filePath: string; source: string }
): Promise<FileResult> {
  function failure(error: unknown): FileResult {
    const message = error instanceof Error ? error.message : String(error);
    return {
      errors: [new ContentError(filePath, { message }, { cause: error })],
    };
  }

  let source: string;
  try {
    source = await readFile(sourcePath, "utf-8");
  } catch (error) {
    return failure(error);
  }
  const sourceHash = hash(source);
  const cached = cache?.get(file);
  if (cached?.hash === sourceHash) {
    return { entry: cached.entry, warnings: [] };
  }

  let parsed: ParseResult;
  try {
    parsed = await parse({ file, filePath, schema: collection.schema, source });
  } catch (error) {
    return failure(error);
  }
  if (parsed.issues) {
    return {
      errors: parsed.issues.map((issue) => new ContentError(filePath, issue)),
    };
  }
  const { document } = parsed;

  let output: unknown;
  let code = "";
  try {
    output = collection.transform
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
    if (!(output instanceof Skipped)) {
      code = serialize(output);
    }
  } catch (error) {
    return failure(error);
  }

  const entry = { code, filePath, output, slug: document.slug };
  cache?.set(file, { entry, hash: sourceHash });
  return {
    entry,
    warnings: parsed.warnings.map(
      (warning) => new ContentError(filePath, warning).message
    ),
  };
}

export {
  ContentError,
  type Entry,
  type FileCache,
  inCollection,
  loadCollection,
};
