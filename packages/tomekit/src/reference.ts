import { ContentError } from "./errors";
import type { Locate } from "./parse";
import { Skipped } from "./skipped";
import { isFields, isList } from "./value";
import type { ContentValue } from "./value";

/** Key paths to collection names, keyed by the collection whose metadata holds them. */
type References = Readonly<Record<string, Readonly<Record<string, string>>>>;

interface ReferencingDocument {
  /** Relative to the root, or `undefined` when the loader gave no file. */
  file: string | undefined;
  locate: Locate | undefined;
  output: ContentValue | Skipped;
  slug: string;
}

/** A collection after it loaded: the documents it kept, and the slugs it left out. */
interface ReferencedCollection {
  /** Slugs of entries with errors. */
  broken: ReadonlySet<string>;
  documents: readonly ReferencingDocument[];
  name: string;
  /** Slugs a transform skipped, with the reason it gave. */
  skipped: ReadonlyMap<string, string | undefined>;
}

interface ReferenceResult {
  /** One per slug that does not resolve. */
  errors: ContentError[];
  /** Slugs of documents with a reference that does not resolve, by collection name. Left out like any broken document. */
  leftOut: ReadonlyMap<string, ReadonlySet<string>>;
}

interface Found {
  /** Where the value is, array indexes included, eg `["sections", "1", "author"]`. */
  keys: readonly string[];
  value: ContentValue;
}

/** Every value at a dot-separated path, through arrays at any level. */
function valuesAt(
  value: ContentValue,
  path: readonly string[],
  keys: readonly string[] = []
): Found[] {
  if (isList(value)) {
    return value.flatMap((item, index) =>
      valuesAt(item, path, [...keys, String(index)])
    );
  }

  const [key, ...rest] = path;

  if (key === undefined) {
    return [{ keys, value }];
  }

  if (!isFields(value) || !Object.hasOwn(value, key)) {
    return [];
  }

  return valuesAt(value[key], rest, [...keys, key]);
}

function isString(value: ContentValue): value is string {
  return new Object(value) instanceof String;
}

/**
 * Checks that every string at a referenced path is the slug of a document the
 * target collection kept. A document with one that is not is left out, which
 * can break references to it in turn, so the check repeats until nothing
 * changes.
 */
function checkReferences(
  collections: readonly ReferencedCollection[],
  references: References
): ReferenceResult {
  const byName = new Map(
    collections.map((collection) => [collection.name, collection])
  );

  const available = new Map(
    collections.map((collection) => [
      collection.name,
      new Set(collection.documents.map((document) => document.slug)),
    ])
  );

  const leftOut = new Map(
    collections.map((collection) => [collection.name, new Set<string>()])
  );

  const errors: ContentError[] = [];

  function problem(name: string, slug: string): string | undefined {
    if (available.get(name)?.has(slug) === true) {
      return undefined;
    }

    const target = byName.get(name);
    const collection = JSON.stringify(name);

    if (target?.skipped.has(slug) === true) {
      const reason = target.skipped.get(slug);
      const because = reason === undefined ? "" : ` (${reason})`;

      return `"${slug}" in collection ${collection} is skipped${because}. Point at a document that is not skipped`;
    }

    if (
      target?.broken.has(slug) === true ||
      target?.documents.some((document) => document.slug === slug) === true
    ) {
      return `"${slug}" in collection ${collection} has errors, so it is left out. Fix those first`;
    }

    return `no document in collection ${collection} has the slug "${slug}". Fix the slug, or add a document with it to ${collection}`;
  }

  let changed = true;

  while (changed) {
    changed = false;

    for (const collection of collections) {
      const paths = Object.entries(references[collection.name] ?? {});
      const kept = available.get(collection.name);
      const removed = leftOut.get(collection.name);

      for (const document of collection.documents) {
        const { output } = document;

        if (
          removed?.has(document.slug) !== false ||
          output instanceof Skipped ||
          !isFields(output)
        ) {
          continue;
        }

        const issues = paths.flatMap(([path, target]) =>
          valuesAt(output.metadata, path.split(".")).flatMap(
            ({ keys, value }) => {
              const message = isString(value)
                ? problem(target, value)
                : undefined;

              return message === undefined
                ? []
                : [
                    {
                      ...document.locate?.(keys),
                      message: `${keys.join(".")}: ${message}`,
                    },
                  ];
            }
          )
        );

        if (issues.length === 0) {
          continue;
        }

        const subject = {
          collection: collection.name,
          file: document.file,
          slug: document.slug,
        };

        errors.push(...issues.map((issue) => new ContentError(subject, issue)));
        removed.add(document.slug);
        kept?.delete(document.slug);
        changed = true;
      }
    }
  }

  return { errors, leftOut };
}

export {
  checkReferences,
  type ReferencedCollection,
  type ReferenceResult,
  type References,
  type ReferencingDocument,
};
