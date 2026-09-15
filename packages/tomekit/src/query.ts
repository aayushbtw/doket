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
 * const posts = collections.get("posts");
 *
 * posts.documents().filter((post) => post.metadata.tags.includes("vite"));
 * posts.get("hello-world").metadata.title;
 * posts.slugs(); // ["hello-world", "setup"]
 * ```
 */
interface Collection<
  TDocument,
  TSlug extends string = string,
  TKnownSlug extends TSlug = never,
> {
  /** Every document, in the order its loader returned them, eg file name order for `directory`. Sort, filter and slice it like any array. */
  documents(this: void): readonly TDocument[];
  /**
   * The document with this slug. A slug that exists returns its document.
   *
   * @example
   * ```ts
   * posts.get("hello-world").metadata.title;
   * ```
   */
  // Method syntax, so a collection with known slugs still fits a helper that takes `Collection<T>`.
  // `TKnownSlug` is its own parameter, not a conditional on `TSlug`, which would stop that fit.
  // Without known slugs it is `never`, so this overload takes nothing and every lookup may be `undefined`.
  // `this: void` tells lint that destructuring a member from a collection is safe.
  get(this: void, slug: TKnownSlug): TDocument;
  /**
   * The document with this slug, or `undefined` if there is none, eg for a
   * route param.
   *
   * @example
   * ```ts
   * const post = posts.get(params.slug);
   * if (!post) throw notFound();
   * ```
   */
  get(this: void, slug: string): TDocument | undefined;
  /**
   * Whether a document has this slug. Narrows a route param to the
   * collection's slugs, so `get` then returns the document.
   *
   * @example
   * ```ts
   * if (posts.has(params.slug)) posts.get(params.slug).metadata.title;
   * ```
   */
  // Narrows to `TSlug`, not `TKnownSlug`: a predicate on `TKnownSlug` would stop the fit described above.
  has(this: void, slug: string): slug is TSlug;
  /** Every slug, in the same order as `documents()`. */
  slugs(this: void): readonly TSlug[];
}

/**
 * Every collection, without the generated name and slug types.
 *
 * @internal
 */
interface Collections<TDocument> {
  /** The collection with this name, or `undefined` if there is none. */
  get(this: void, name: string): Collection<TDocument> | undefined;
  /** Whether a collection has this name. */
  has(this: void, name: string): boolean;
  /** Every collection name, in config order. */
  names(this: void): readonly string[];
}

/**
 * Wraps a collection's documents for the generated `tomekit/content` module:
 * each pair is `[slug, document]`.
 *
 * @internal
 */
function createCollection<TDocument>(
  pairs: readonly (readonly [string, TDocument])[]
): Collection<TDocument> {
  const bySlug = new Map(pairs);
  const documents = pairs.map(([, document]) => document);
  const slugs = pairs.map(([slug]) => slug);

  function get(slug: never): TDocument;
  function get(slug: string): TDocument | undefined;
  function get(slug: string): TDocument | undefined {
    return bySlug.get(slug);
  }

  function has(slug: string): slug is string {
    return bySlug.has(slug);
  }

  return {
    documents: () => documents,
    get,
    has,
    slugs: () => slugs,
  };
}

/**
 * Builds the `collections` export of the generated `tomekit/content` module,
 * keyed by name in config order.
 *
 * @internal
 */
function createCollections<TDocument>(
  byName: Readonly<Record<string, Collection<TDocument>>>
): Collections<TDocument> {
  const names = Object.keys(byName);

  function has(name: string): boolean {
    return Object.hasOwn(byName, name);
  }

  return {
    get: (name) => (has(name) ? byName[name] : undefined),
    has,
    names: () => names,
  };
}

export {
  type Collection,
  type Collections,
  createCollection,
  createCollections,
  type Prettify,
};
