/**
 * Flattens an intersection into one object type for display.
 *
 * @internal
 */
// Intersecting with an empty object makes TypeScript print the resolved fields instead of the alias.
type Prettify<TValue> = { [TKey in keyof TValue]: TValue[TKey] } & Record<
  never,
  never
>;

/**
 * One collection's documents. Everything is built ahead of time, so reads are synchronous.
 *
 * @example
 * ```ts
 * content.posts.all.filter((post) => post.tags.includes("vite"));
 * content.posts.get("hello-world")?.title;
 * content.posts.slugs; // ["hello-world", "setup"]
 * ```
 */
interface Collection<TDocument, TSlug extends string = string> {
  /** Every document, in file name order. Sort, filter and slice it like any array. */
  readonly all: readonly TDocument[];
  /**
   * The document with this slug, or `undefined` if there is none. Suggests
   * the slugs that exist, and accepts any string, eg a route param.
   *
   * @example
   * ```ts
   * const post = content.posts.get(params.slug);
   * if (!post) throw notFound();
   * ```
   */
  // Method syntax, so `Collection<T, "a">` still fits a helper that takes `Collection<T>`.
  // `string & Record<never, never>` keeps the known slugs as suggestions while accepting any string.
  // `this: void` tells lint that destructuring `get` from a collection is safe.
  get(
    this: void,
    slug: TSlug | (string & Record<never, never>)
  ): TDocument | undefined;
  /** Every slug, in the same order as `all`. */
  readonly slugs: readonly TSlug[];
}

/**
 * Wraps a collection's documents for the generated `tomekit/content` module:
 * each entry is `[slug, document]`.
 *
 * @internal
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
