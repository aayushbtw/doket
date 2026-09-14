import { createHash } from "node:crypto";
import { glob, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { assertTransformResult, buildDocument } from "./document";
import { ContentError } from "./errors";
import { Skipped } from "./index";
import type { CollectionConfig } from "./index";
import { parse } from "./parse";
import type { ParseResult } from "./parse";
import { serialize } from "./serialize";
import type { ContentValue } from "./value";

const DEFAULT_INCLUDE = "**/*.md";

/** A document as the build needs it: its output, the code for it, and where it came from. */
interface BuiltDocument {
  /** `output` as JavaScript source. */
  code: string;
  filePath: string;
  output: ContentValue | Skipped;
  /** Computed before the transform, so lookups work whatever it returns. */
  slug: string;
}

/** A file's last result, reused while its text and the config are unchanged. */
type FileCache = Map<string, { document: BuiltDocument; hash: string }>;

interface CollectionResult {
  /** Every kept document, in file name order. Broken files are left out. */
  documents: BuiltDocument[];
  errors: ContentError[];
  warnings: string[];
}

type FileResult =
  | { document: BuiltDocument; errors?: undefined }
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

function hash(text: string): string {
  return createHash("sha1").update(text).digest("base64");
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
  const empty = `collections.get(${JSON.stringify(name)}) is empty`;

  if (!(await isDirectory(directory))) {
    return {
      documents: [],
      errors: [],
      warnings: [
        `${name}: directory "${collection.directory}" does not exist, so ${empty}`,
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
      `${name}: no files in "${collection.directory}" match ${JSON.stringify(collection.include ?? DEFAULT_INCLUDE)}, so ${empty}`
    );
  }

  const results = await Promise.all(
    files.map(
      async (file) =>
        await loadFile(name, collection, file, {
          absolutePath: path.join(directory, file),
          cache,
          filePath: path.relative(root, path.join(directory, file)),
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
  const bySlug = new Map<string, BuiltDocument>();
  const documents: BuiltDocument[] = [];

  for (const result of results) {
    if (result.errors) {
      errors.push(...result.errors);
      continue;
    }

    const { document } = result;

    if (document.output instanceof Skipped) {
      continue;
    }

    const first = bySlug.get(document.slug);

    if (first !== undefined) {
      errors.push(
        new ContentError(document.filePath, {
          message: `slug "${document.slug}" is already used by ${first.filePath}`,
        })
      );
      continue;
    }

    bySlug.set(document.slug, document);
    documents.push(document);
  }

  return { documents, errors, warnings };
}

async function loadFile(
  name: string,
  collection: CollectionConfig,
  file: string,
  {
    absolutePath,
    cache,
    filePath,
  }: { absolutePath: string; cache?: FileCache; filePath: string }
): Promise<FileResult> {
  function failure(cause: unknown): FileResult {
    const message = cause instanceof Error ? cause.message : String(cause);

    return {
      errors: [new ContentError(filePath, { message }, { cause })],
    };
  }

  let text: string;

  try {
    text = await readFile(absolutePath, "utf-8");
  } catch (error) {
    return failure(error);
  }

  const textHash = hash(text);
  const cached = cache?.get(file);

  if (cached?.hash === textHash) {
    return { document: cached.document };
  }

  let parsed: ParseResult;

  try {
    parsed = await parse({ file, filePath, schema: collection.schema, text });
  } catch (error) {
    return failure(error);
  }

  if (parsed.issues) {
    return {
      errors: parsed.issues.map((issue) => new ContentError(filePath, issue)),
    };
  }

  const { source } = parsed;

  let output: ContentValue | Skipped;
  let code = "";

  try {
    const result: unknown = collection.transform
      ? await collection.transform(source, { collection: name, skip })
      : {};

    if (result instanceof Skipped) {
      output = result;
    } else {
      assertTransformResult(result);
      output = buildDocument(source, result);
      code = serialize(output);
    }
  } catch (error) {
    return failure(error);
  }

  const document = { code, filePath, output, slug: source.slug };
  cache?.set(file, { document, hash: textHash });

  return { document };
}

export { type BuiltDocument, type FileCache, inCollection, loadCollection };
