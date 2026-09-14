import type { Prettify } from "./query";
import type { ContentValue } from "./value";

/**
 * Any validator that implements [Standard Schema](https://standardschema.dev),
 * eg Zod, Valibot or ArkType.
 */
// Only the part of Standard Schema v1 tomekit reads, so no validator is a dependency.
interface StandardSchema<TOutput = unknown> {
  readonly "~standard": {
    readonly types?: { readonly output: TOutput };
    readonly validate: (
      value: ContentValue
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

/**
 * A document before `transform`: its frontmatter as the schema produced it,
 * and the file's text.
 *
 * @example
 * ```ts
 * // One transform shared by several collections
 * function withUrl<TMetadata extends object>(
 *   { metadata, slug }: Source<TMetadata>,
 *   { collection }: TransformContext
 * ) {
 *   return { metadata: { ...metadata, url: `/${collection}/${slug}` } };
 * }
 * ```
 */
interface Source<TMetadata = unknown> {
  /** The file's text after the frontmatter block. */
  body: string;
  /** Where the file lives, eg `{ name: "setup.md", path: "content/guides/setup.md" }`. */
  file: FileInfo;
  /** The frontmatter, as the collection's schema produced it. */
  metadata: TMetadata;
  /**
   * The `slug` in the frontmatter when it is a non-empty string, otherwise the
   * path inside the collection directory without the extension, eg `guides/setup`.
   */
  slug: string;
}

/**
 * Returned from `transform` to leave a file out of its collection. Create
 * one with `skip()` from {@link TransformContext}.
 */
class Skipped {
  // A private field, so no plain output object matches this type by shape.
  readonly #reason: string | undefined;

  constructor(reason?: string) {
    this.#reason = reason;
  }

  /** Why the file was skipped, eg `"draft"`. */
  get reason(): string | undefined {
    return this.#reason;
  }
}

/** The second argument to `transform`. */
interface TransformContext<TName extends string = string> {
  /** The name of the collection, eg `posts`. */
  collection: TName;
  /**
   * Leaves this file out of the collection. Return its result.
   *
   * @example
   * ```ts
   * transform: ({ metadata }, { skip }) => (metadata.draft ? skip("draft") : {})
   * ```
   */
  skip: (reason?: string) => Skipped;
}

/**
 * What `transform` returns: a new `metadata` and/or `body`. Whatever it leaves
 * out stays as it was.
 */
interface TransformResult {
  /** Replaces the document's body, eg with rendered HTML. */
  body?: unknown;
  /** Replaces the document's metadata, eg to add derived fields. */
  metadata?: unknown;
}

type TransformOutput = Skipped | TransformResult;

/**
 * A glob pattern. Suggests common ones and accepts any string.
 *
 * @internal
 */
type Glob = "**/*.md" | "**/*.mdx" | "*.md" | (string & Record<never, never>);

/** One collection: where its files are, how to validate them and what to return. */
interface CollectionConfig<
  TSchema extends StandardSchema<object> = StandardSchema<object>,
  TOutput = unknown,
> {
  /** Where the files live, relative to the project root, eg `content/posts`. */
  directory: string;
  /** Glob patterns, relative to `directory`, of files to leave out, eg `"drafts/**"`. */
  exclude?: Glob | readonly Glob[];
  /**
   * Glob patterns, relative to `directory`, of files to load.
   *
   * @default "**\/*.md"
   */
  include?: Glob | readonly Glob[];
  /** Validates each file's frontmatter, and must produce an object. A file without frontmatter is validated as `{}`. */
  schema: TSchema;
  /**
   * Changes each document at build time. Return a new `metadata` and/or
   * `body`, and their types become the document's. Return data only: plain
   * objects, arrays, primitives, `Date`, `Map`, `Set`, `URL` or `RegExp`.
   *
   * @example
   * ```ts
   * transform: ({ body, metadata, slug }) => ({
   *   body: marked.parse(body, { async: false }),
   *   metadata: { ...metadata, url: `/posts/${slug}` },
   * })
   * ```
   */
  transform?: (
    source: Source<InferOutput<TSchema>>,
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
  /** Keyed by collection name, eg `posts` for `collections.get("posts")`. */
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

// `unknown` when a config has no transform; the whole `TransformOutput` when inference fell back to the constraint.
type IsUntransformed<TOutput> = unknown extends TOutput
  ? true
  : [TransformOutput] extends [TOutput]
    ? true
    : false;

// Distributes, so a transform that returns different shapes gives a union of documents.
type DocumentFrom<TMetadata, TResult> = TResult extends unknown
  ? {
      body: TResult extends { body: infer TBody } ? TBody : string;
      file: FileInfo;
      metadata: TResult extends { metadata: infer TNewMetadata }
        ? PrettifyIfPlainObject<TNewMetadata>
        : TMetadata;
      slug: string;
    }
  : never;

/**
 * The document type of a collection config, for the generated types in
 * `.tomekit`. Users read `DocumentOf` from `tomekit/content`.
 *
 * @internal
 */
type InferDocument<TCollection> =
  TCollection extends CollectionConfig<infer TSchema, infer TOutput>
    ? DocumentFrom<
        InferOutput<TSchema>,
        IsUntransformed<TOutput> extends true
          ? Record<never, never>
          : Exclude<Awaited<TOutput>, Skipped>
      >
    : never;

/**
 * Narrows a document's `slug` to the slugs that exist, for the generated
 * types in `.tomekit`.
 *
 * @internal
 */
type WithSlug<TDocument, TSlug extends string> = TDocument extends {
  slug: string;
}
  ? Prettify<Omit<TDocument, "slug"> & { slug: TSlug }>
  : TDocument;

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
  TSchema extends StandardSchema<object>,
  TOutput extends TransformOutput = TransformOutput,
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
    Extract<TSchemas[TName], StandardSchema<object>>,
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
// contextually typed; one mapped type loses the output types. `TSchemas` is
// unconstrained and `schema` checked on its own, so a schema that does not
// produce an object is reported on `schema` instead of breaking inference.
function defineConfig<
  TSchemas extends Record<string, StandardSchema>,
  // Unconstrained: a constraint here makes inference fall back to it and lose each transform's output type.
  TOutputs extends { [TName in keyof TSchemas]: unknown },
>(config: {
  collections: {
    [TName in keyof TSchemas]: Omit<
      CollectionConfig,
      "schema" | "transform"
    > & {
      /** Validates each file's frontmatter, and must produce an object. A file without frontmatter is validated as `{}`. */
      schema: TSchemas[TName] & StandardSchema<object>;
    };
  } & {
    [TName in keyof TOutputs]: {
      /** Changes each document at build time. Return a new `metadata` and/or `body`, and their types become the document's. */
      transform?: (
        source: Source<InferOutput<TSchemas[TName & keyof TSchemas]>>,
        context: TransformContext<TName & string>
      ) => TOutputs[TName];
    };
  };
}): Config<InferredCollections<TSchemas, TOutputs>>;
// Loose on purpose: the parameter's `schema` intersection never matches the inferred return type.
function defineConfig(config: Config): Config {
  return config;
}

export {
  type CollectionConfig,
  type Config,
  defineCollection,
  defineConfig,
  type FileInfo,
  type InferDocument,
  Skipped,
  type Source,
  type StandardSchema,
  type TransformContext,
  type TransformResult,
  type WithSlug,
};

export type { Collection } from "./query";

export {
  BrokenContentError,
  ConfigError,
  ConfigLoadError,
  ContentError,
  InvalidConfigError,
  MissingDefaultExportError,
  MissingPluginError,
  PluginError,
  PluginNotReadyError,
  TomekitError,
  TransformError,
  TransformResultError,
  UnknownTransformFieldError,
  UnserializableInstanceError,
  UnserializableValueError,
} from "./errors";
