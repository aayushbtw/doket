import { createHash } from "node:crypto";
import path from "node:path";

import type { Glob } from "./directory";
import { assertTransformResult, buildDocument } from "./document";
import { ContentError } from "./errors";
import type { Issue } from "./errors";
import type { CollectionConfig, Entry, LoadResult } from "./index";
import { isLocated, LOCATE } from "./parse";
import type { Locate } from "./parse";
import { serialize } from "./serialize";
import { REASON, Skipped } from "./skipped";
import { validate } from "./validate";
import { assertContentValue, isPlainObject } from "./value";
import type { ContentValue } from "./value";

/** A document as the build needs it: its output, the code for it, and where it came from. */
interface BuiltDocument {
  /** `output` as JavaScript source. */
  code: string;
  /** Relative to the root, or `undefined` when the loader gave no file. */
  file: string | undefined;
  /** Where a metadata key is written, when the loader can tell. */
  locate: Locate | undefined;
  output: ContentValue | Skipped;
  /** Computed before the transform, so lookups work whatever it returns. */
  slug: string;
  /** Where the metadata sets `slug`, or `undefined` when the loader chose it. */
  slugPosition: Omit<Issue, "message"> | undefined;
}

/** An entry's last result by slug, reused while the entry and the config are unchanged. */
type EntryCache = Map<string, { document: BuiltDocument; hash: string }>;

/** One `watch` call's globs, as absolute patterns. */
interface WatchGroup {
  /** Only leaves out files matched by `include` from the same call. */
  exclude: string[];
  include: string[];
}

interface CollectionResult {
  /** Slugs of entries with errors, so a reference to one can say why it does not resolve. */
  broken: Set<string>;
  /** Every kept document, in the loader's order. Broken entries are left out. */
  documents: BuiltDocument[];
  errors: ContentError[];
  /** Whether `load` threw or returned no `entries` array. */
  failed: boolean;
  /** Slugs a transform skipped, with the reason it gave. */
  skipped: Map<string, string | undefined>;
  /** Every `watch` call `load` made, including before it threw. */
  watched: WatchGroup[];
  warnings: string[];
}

type EntryResult =
  | { document: BuiltDocument; errors?: undefined }
  | { errors: ContentError[] };

function skip(reason?: string): Skipped {
  return new Skipped(reason);
}

function hash(text: string): string {
  return createHash("sha1").update(text).digest("base64");
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function isSlug(value: unknown): value is string {
  return new Object(value) instanceof String && value !== "";
}

function isLoadResult(value: unknown): value is LoadResult {
  return (
    isPlainObject(value) && "entries" in value && Array.isArray(value.entries)
  );
}

async function loadCollection(
  name: string,
  collection: CollectionConfig,
  root: string,
  {
    cache,
    dev = false,
    watched = [],
  }: {
    cache?: EntryCache;
    dev?: boolean;
    /** Receives each `watch` call as it happens, so a caller can match changes while `load` runs. */
    watched?: WatchGroup[];
  } = {}
): Promise<CollectionResult> {
  let loaded: unknown;

  function watch(patterns: Glob | readonly Glob[]) {
    const list = [patterns].flat();

    watched.push({
      exclude: list
        .filter((pattern) => pattern.startsWith("!"))
        .map((pattern) => path.resolve(root, pattern.slice(1))),
      include: list
        .filter((pattern) => !pattern.startsWith("!"))
        .map((pattern) => path.resolve(root, pattern)),
    });
  }

  try {
    loaded = await collection.loader.load({
      collection: name,
      dev,
      root,
      watch,
    });
  } catch (error) {
    return {
      broken: new Set(),
      documents: [],
      errors: [
        new ContentError(
          { collection: name },
          { message: `the loader failed: ${messageOf(error)}` },
          { cause: error }
        ),
      ],
      failed: true,
      skipped: new Map(),
      warnings: [],
      watched,
    };
  }

  if (!isLoadResult(loaded)) {
    return {
      broken: new Set(),
      documents: [],
      errors: [
        new ContentError(
          { collection: name },
          {
            message:
              "the loader's `load` must return an object with an `entries` array, eg `{ entries: [] }`",
          }
        ),
      ],
      failed: true,
      skipped: new Map(),
      warnings: [],
      watched,
    };
  }

  const errors = (loaded.issues ?? []).map(
    ({ cause, file, slug, ...issue }) =>
      new ContentError({ collection: name, file, slug }, issue, { cause })
  );

  // An entry a loader reported an issue for is still validated, so all of its problems show, but it is left out.
  const reported = new Set(
    (loaded.issues ?? []).map(({ file, slug }) =>
      file === undefined ? `slug:${slug}` : `file:${file}`
    )
  );

  const results = await Promise.all(
    loaded.entries.map(async (entry) => {
      const key =
        entry.file === undefined
          ? `slug:${entry.slug}`
          : `file:${entry.file.path}`;

      return await loadEntry(name, collection, entry, {
        broken: reported.has(key),
        cache,
        dev,
      });
    })
  );

  if (cache !== undefined) {
    const present = new Set(loaded.entries.map((entry) => entry.slug));

    for (const slug of cache.keys()) {
      if (!present.has(slug)) {
        cache.delete(slug);
      }
    }
  }

  const bySlug = new Map<string, BuiltDocument>();
  const documents: BuiltDocument[] = [];
  const broken = new Set<string>();
  const skipped = new Map<string, string | undefined>();

  for (const [index, result] of results.entries()) {
    if (result.errors) {
      errors.push(...result.errors);
      const slug = loaded.entries[index]?.slug;

      if (isSlug(slug)) {
        broken.add(slug);
      }

      continue;
    }

    const { document } = result;

    if (document.output instanceof Skipped) {
      skipped.set(document.slug, document.output[REASON]);
      continue;
    }

    const first = bySlug.get(document.slug);

    if (first !== undefined) {
      errors.push(duplicateSlug(name, document, first));
      continue;
    }

    bySlug.set(document.slug, document);
    documents.push(document);
  }

  return {
    broken,
    documents,
    errors,
    failed: false,
    skipped,
    warnings: [...(loaded.warnings ?? [])],
    watched,
  };
}

function duplicateSlug(
  name: string,
  document: BuiltDocument,
  first: BuiltDocument
): ContentError {
  const used = `slug "${document.slug}" is already used by`;

  if (document.file === undefined) {
    return new ContentError(
      { collection: name, slug: document.slug },
      { message: `${used} another entry. Return a unique slug from the loader` }
    );
  }

  const fix =
    document.slugPosition === undefined
      ? "Rename this file, or set a different `slug` in its frontmatter"
      : "Change this file's `slug`";

  return new ContentError(
    { collection: name, file: document.file },
    {
      ...document.slugPosition,
      message: `${used} ${first.file ?? "another entry"}. ${fix}`,
    }
  );
}

async function loadEntry(
  name: string,
  collection: CollectionConfig,
  entry: Entry,
  { broken, cache, dev }: { broken: boolean; cache?: EntryCache; dev: boolean }
): Promise<EntryResult> {
  const file = entry.file?.path;
  const subject = { collection: name, file, slug: entry.slug };

  function failure(cause: unknown): EntryResult {
    return {
      errors: [
        new ContentError(subject, { message: messageOf(cause) }, { cause }),
      ],
    };
  }

  if (!isSlug(entry.slug)) {
    return {
      errors: [
        new ContentError(
          { collection: name, file },
          {
            message: `slug must be a non-empty string, got ${JSON.stringify(entry.slug)}`,
          }
        ),
      ],
    };
  }

  let metadata: ContentValue;
  let entryHash: string;

  try {
    const raw: unknown = entry.metadata ?? {};
    assertContentValue(raw);
    metadata = raw;

    const fileInfo =
      entry.file === undefined
        ? undefined
        : { name: entry.file.name, path: entry.file.path };

    entryHash = hash(
      serialize({
        body: entry.body,
        file: fileInfo,
        metadata,
        slug: entry.slug,
      })
    );
  } catch (error) {
    return failure(error);
  }

  const locate = isLocated(entry) ? entry[LOCATE] : undefined;
  const setsSlug = isPlainObject(metadata) && "slug" in metadata;
  // Not cached: the same data can sit on a different line after an edit.
  const slugPosition = setsSlug ? locate?.(["slug"]) : undefined;
  const cached = broken ? undefined : cache?.get(entry.slug);

  if (cached?.hash === entryHash) {
    return { document: { ...cached.document, locate, slugPosition } };
  }

  const validated = await validate(entry, metadata, collection.schema, locate);

  if (validated.issues) {
    return {
      errors: validated.issues.map((issue) => new ContentError(subject, issue)),
    };
  }

  if (broken) {
    return { errors: [] };
  }

  const { source } = validated;

  let output: ContentValue | Skipped;
  let code = "";

  try {
    const result: unknown = collection.transform
      ? await collection.transform(source, { collection: name, dev, skip })
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

  const document = {
    code,
    file,
    locate,
    output,
    slug: source.slug,
    slugPosition,
  };

  cache?.set(entry.slug, { document, hash: entryHash });

  return { document };
}

export {
  type BuiltDocument,
  type CollectionResult,
  type EntryCache,
  loadCollection,
  type WatchGroup,
};
