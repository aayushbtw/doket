import type { Collection, Prettify } from "./query";

// The subset of Standard Schema v1 (https://standardschema.dev) the engine
// reads, so any validator that implements it works, not only Zod.
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
  file: FileInfo;
  /**
   * The frontmatter `slug` when it is a string, otherwise the path inside the
   * collection directory without the extension, eg `guides/setup`.
   */
  slug: string;
}

// Distributes, so each member of a union schema keeps its own fields.
type Document<TSchema> =
  InferOutput<TSchema> extends infer TOutput
    ? TOutput extends unknown
      ? Prettify<Omit<TOutput, keyof BaseDocument> & BaseDocument>
      : never
    : never;

/** Returned from `transform` to leave a document out of its collection. */
class Skipped {
  // A private field, so no plain output object matches this type by shape.
  readonly #reason: string | undefined;

  constructor(reason?: string) {
    this.#reason = reason;
  }

  get reason(): string | undefined {
    return this.#reason;
  }
}

interface TransformContext<TName extends string = string> {
  /** The collection's key in the config, eg `posts`. */
  collection: TName;
  /** Leaves this document out of the collection, eg a draft. */
  skip: (reason?: string) => Skipped;
}

interface CollectionConfig<
  TSchema extends StandardSchema = StandardSchema,
  TOutput = unknown,
> {
  /** Relative to the project root. */
  directory: string;
  /** Glob patterns relative to `directory` to leave out. */
  exclude?: string | readonly string[];
  /** Glob patterns relative to `directory`. Defaults to `"**\/*.md"`. */
  include?: string | readonly string[];
  schema: TSchema;
  transform?: (
    document: Document<TSchema>,
    context: TransformContext
  ) => TOutput | Promise<TOutput>;
}

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

/** The type of a collection's documents, eg `InferDocument<typeof posts>`. */
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

type Content<TConfig extends Config = Config> = {
  [TName in keyof TConfig["collections"]]: Collection<
    InferDocument<TConfig["collections"][TName]>
  >;
};

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
