/**
 * Flattens an intersection into one object type for display.
 *
 * @internal
 */
// `& {}` makes TypeScript print the resolved fields instead of the alias.
// oxlint-disable-next-line typescript/ban-types
type Prettify<TValue> = { [TKey in keyof TValue]: TValue[TKey] } & {};

interface Collection<TDocument, TSlug extends string = string> {
  /** Every document, in file name order. Sort, filter and slice it like any array. */
  readonly all: readonly TDocument[];
  /**
   * The document with this slug. `string & {}` keeps the known slugs as
   * suggestions while still accepting any string, eg a route param.
   */
  // Method syntax, so `Collection<T, "a">` still fits a helper that takes `Collection<T>`.
  // oxlint-disable-next-line typescript/ban-types, typescript/method-signature-style, typescript/no-invalid-void-type
  get(this: void, slug: TSlug | (string & {})): TDocument | undefined;
  /** Every slug, in the same order as `all`. */
  readonly slugs: readonly TSlug[];
}

/**
 * Wraps a collection's documents for the generated `tomekit/content` module:
 * each entry is `[slug, document]`.
 */
function createCollection<TDocument>(
  entries: readonly (readonly [string, TDocument])[]
): Collection<TDocument> {
  const bySlug = new Map(entries);
  return {
    all: entries.map(([, document]) => document),
    get: (slug) => bySlug.get(slug),
    slugs: entries.map(([slug]) => slug),
  };
}

export { type Collection, createCollection, type Prettify };
