import { createHash } from "node:crypto";

import { assertTransformResult, buildDocument } from "./document";
import { ContentError } from "./errors";
import type { Issue } from "./errors";
import type { CollectionConfig, Entry, LoadResult } from "./index";
import { isLocated, LOCATE } from "./parse";
import { serialize } from "./serialize";
import { Skipped } from "./skipped";
import { validate } from "./validate";
import { assertContentValue, isPlainObject } from "./value";
import type { ContentValue } from "./value";

/** A document as the build needs it: its output, the code for it, and where it came from. */
interface BuiltDocument {
  /** `output` as JavaScript source. */
  code: string;
  /** Relative to the root, or `undefined` when the loader gave no file. */
  file: string | undefined;
  output: ContentValue | Skipped;
  /** Computed before the transform, so lookups work whatever it returns. */
  slug: string;
  /** Where the metadata sets `slug`, or `undefined` when the loader chose it. */
  slugPosition: Omit<Issue, "message"> | undefined;
}

/** An entry's last result by slug, reused while the entry and the config are unchanged. */
type EntryCache = Map<string, { document: BuiltDocument; hash: string }>;

interface CollectionResult {
  /** Every kept document, in the loader's order. Broken entries are left out. */
  documents: BuiltDocument[];
  errors: ContentError[];
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
  { cache }: { cache?: EntryCache } = {}
): Promise<CollectionResult> {
  let loaded: unknown;

  try {
    loaded = await collection.loader.load({ collection: name, root });
  } catch (error) {
    return {
      documents: [],
      errors: [
        new ContentError(
          { collection: name },
          { message: `the loader failed: ${messageOf(error)}` },
          { cause: error }
        ),
      ],
      warnings: [],
    };
  }

  if (!isLoadResult(loaded)) {
    return {
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
      warnings: [],
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
      errors.push(duplicateSlug(name, document, first));
      continue;
    }

    bySlug.set(document.slug, document);
    documents.push(document);
  }

  return { documents, errors, warnings: [...(loaded.warnings ?? [])] };
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
  { broken, cache }: { broken: boolean; cache?: EntryCache }
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
    return { document: { ...cached.document, slugPosition } };
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

  const document = { code, file, output, slug: source.slug, slugPosition };

  cache?.set(entry.slug, { document, hash: entryHash });

  return { document };
}

export {
  type BuiltDocument,
  type CollectionResult,
  type EntryCache,
  loadCollection,
};
