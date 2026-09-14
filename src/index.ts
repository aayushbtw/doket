import type { Collection, Prettify } from "./query";

/**
 * Any validator that implements [Standard Schema](https://standardschema.dev),
 * eg Zod, Valibot or ArkType.
 */
// Only the part of Standard Schema v1 tomekit reads, so no validator is a dependency.
interface StandardSchema<TOutput = unknown> {
  readonly "~standard": {
    readonly types?: { readonly output: TOutput };
    readonly validate: (
      value: unknown
    ) => StandardResult<TOutput> | Promise<StandardResult<TOutput>>;
  };
}

type StandardResult<TOutput> =
  | { readonly issues?: undefined; readonly value: TOutput }
  | {
      readonly issues: readonly {
        readonly message: string;
        readonly path?: readonly (
          | PropertyKey
          | { readonly key: PropertyKey }
        )[];
      }[];
    };

type InferOutput<TSchema> =
  TSchema extends StandardSchema<infer TOutput> ? TOutput : never;

/** Where a document's file lives. */
interface FileInfo {
  /** The file name with its extension, eg `setup.md`. */
  name: string;
  /** Relative to the project root, eg `content/guides/setup.md`. */
  path: string;
}

/** The fields tomekit adds to every document, whatever its schema. */
interface BaseDocument {
  /** The file's body, after the frontmatter block. */
  content: string;
  /** Where the file lives, eg `{ name: "setup.md", path: "content/guides/setup.md" }`. */
  file: FileInfo;
  /**
   * The frontmatter `slug` when it is a string, otherwise the path inside the
   * collection directory without the extension, eg `guides/setup`.
   */
  slug: string;
}

/** What `transform` receives: the validated frontmatter plus {@link BaseDocument}. */
// Distributes, so each member of a union schema keeps its own fields.
type Document<TSchema> =
  InferOutput<TSchema> extends infer TOutput
    ? TOutput extends unknown
      ? Prettify<Omit<TOutput, keyof BaseDocument> & BaseDocument>
      : never
    : never;

/**
 * Returned from `transform` to leave a document out of its collection. Create
 * one with `skip()` from {@link TransformContext}.
 */
class Skipped {
  // A private field, so no plain output object matches this type by shape.
  readonly #reason: string | undefined;

  constructor(reason?: string) {
    this.#reason = reason;
  }

  /** Why the document was skipped, eg `"draft"`. */
  get reason(): string | undefined {
    return this.#reason;
  }
}

/**
 * The second argument to `transform`.
 *
 * @example
 * ```ts
 * // One transform shared by several collections
 * function withUrl<T extends BaseDocument>(document: T, { collection }: TransformContext) {
 *   return { ...document, url: `/${collection}/${document.slug}` };
 * }
 * ```
 */
interface TransformContext<TName extends string = string> {
  /** The collection's key in the config, eg `posts`. */
  collection: TName;
  /**
   * Leaves this document out of the collection. Return its result.
   *
   * @example
   * ```ts
   * transform: (document, { skip }) => (document.draft ? skip("draft") : document)
   * ```
   */
  skip: (reason?: string) => Skipped;
}

/** One collection: where its files are, how to validate them and what to return. */
interface CollectionConfig<
  TSchema extends StandardSchema = StandardSchema,
  TOutput = unknown,
> {
  /** Where the files live, relative to the project root, eg `content/posts`. */
  directory: string;
  /** Glob patterns, relative to `directory`, of files to leave out, eg `"drafts/**"`. */
  exclude?: string | readonly string[];
  /**
   * Glob patterns, relative to `directory`, of files to load.
   *
   * @default "**\/*.md"
   */
  include?: string | readonly string[];
  /** Validates each file's frontmatter. A file without frontmatter is validated as `{}`. */
  schema: TSchema;
  /**
   * Shapes each document at build time. Its return type becomes the type of
   * the collection's documents. Return data only: plain objects, arrays,
   * primitives, `Date`, `Map`, `Set`, `URL` or `RegExp`.
   *
   * @example
   * ```ts
   * transform: ({ content, slug, title }) => ({
   *   title,
   *   html: marked.parse(content, { async: false }),
   *   url: `/posts/${slug}`,
   * })
   * ```
   */
  transform?: (
    document: Document<TSchema>,
    context: TransformContext
  ) => TOutput | Promise<TOutput>;
}

/** A tomekit config, as returned by {@link defineConfig}. */
interface Config<
  TCollections extends Record<string, CollectionConfig> = Record<
    string,
    CollectionConfig
  >,
> {
  /** Keyed by the name you query them by, eg `posts` for `content.posts`. */
  collections: TCollections;
}

// Values a transform can return that must keep their own type, not be flattened.
type BuiltIn =
  | Date
  | readonly unknown[]
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | RegExp
  | { readonly [Symbol.toStringTag]: string };

type PrettifyIfPlainObject<TValue> = TValue extends object
  ? TValue extends BuiltIn
    ? TValue
    : Prettify<TValue>
  : TValue;

/**
 * The type of a collection's documents. Prefer the generated types, eg
 * `Posts` from `tomekit/content`, which also narrow `slug`.
 *
 * @example
 * ```ts
 * const posts = defineCollection({ ... });
 * type Post = InferDocument<typeof posts>;
 * ```
 */
type InferDocument<TCollection> =
  TCollection extends CollectionConfig<infer TSchema, infer TOutput>
    ? unknown extends TOutput
      ? Document<TSchema>
      : PrettifyIfPlainObject<Exclude<TOutput, Skipped>>
    : never;

/**
 * Narrows a document's `slug`, when it has one, to the slugs that exist, for
 * the generated types in `.tomekit`.
 *
 * @internal
 */
type WithSlug<TDocument, TSlug extends string> = TDocument extends {
  slug: string;
}
  ? Prettify<Omit<TDocument, "slug"> & { slug: TSlug }>
  : TDocument;

/**
 * The shape of `content` for a config, without generated slug types.
 *
 * @internal
 */
type Content<TConfig extends Config = Config> = {
  [TName in keyof TConfig["collections"]]: Collection<
    InferDocument<TConfig["collections"][TName]>
  >;
};

/**
 * Defines a collection outside the config, eg in its own file, with
 * `transform` typed from its schema.
 *
 * @example
 * ```ts
 * export const posts = defineCollection({
 *   directory: "content/posts",
 *   schema: z.object({ title: z.string() }),
 * });
 *
 * export default defineConfig({ collections: { posts } });
 * ```
 */
function defineCollection<
  TSchema extends StandardSchema,
  TOutput = Document<TSchema>,
>(
  collection: CollectionConfig<TSchema, TOutput>
): CollectionConfig<TSchema, TOutput> {
  return collection;
}

type InferredCollections<
  TSchemas extends Record<string, StandardSchema>,
  TOutputs extends { [TName in keyof TSchemas]: unknown },
> = {
  [TName in keyof TSchemas]: CollectionConfig<
    TSchemas[TName],
    Awaited<TOutputs[TName]>
  >;
};

/**
 * Defines the collections tomekit loads. Use it as the default export of
 * `tomekit.config.ts`.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   collections: {
 *     posts: {
 *       directory: "content/posts",
 *       schema: z.object({ title: z.string(), date: z.coerce.date() }),
 *     },
 *   },
 * });
 * ```
 */
// Two mapped types so schemas are inferred before each `transform` is
// contextually typed; one mapped type loses the output types.
function defineConfig<
  TSchemas extends Record<string, StandardSchema>,
  TOutputs extends { [TName in keyof TSchemas]: unknown },
>(config: {
  collections: {
    [TName in keyof TSchemas]: Omit<
      CollectionConfig<TSchemas[TName]>,
      "transform"
    >;
  } & {
    [TName in keyof TOutputs]: {
      /** Shapes each document at build time. Its return type becomes the type of the collection's documents. */
      transform?: (
        document: Document<TSchemas[TName & keyof TSchemas]>,
        context: TransformContext<TName & string>
      ) => TOutputs[TName];
    };
  };
}): Config<InferredCollections<TSchemas, TOutputs>> {
  return config;
}

export {
  type BaseDocument,
  type CollectionConfig,
  type Config,
  type Content,
  defineCollection,
  defineConfig,
  type Document,
  type FileInfo,
  type InferDocument,
  Skipped,
  type StandardSchema,
  type TransformContext,
  type WithSlug,
};

export type { Collection } from "./query";
