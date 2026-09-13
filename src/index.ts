import type { CollectionQuery, Simplify } from "./query";

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

type Document<TSchema> = Simplify<
  Omit<InferOutput<TSchema>, "content" | "file" | "slug"> & {
    /** The file's body, after the frontmatter block. */
    content: string;
    file: FileInfo;
    /**
     * The frontmatter `slug` when it is a string, otherwise the path inside the
     * collection directory without the extension, eg `guides/setup`.
     */
    slug: string;
  }
>;

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

interface TransformContext {
  /** Leaves this document out of the collection, eg a draft. */
  skip: (reason?: string) => Skipped;
}

interface Collection<
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
  TCollections extends Record<string, Collection> = Record<string, Collection>,
> {
  /** Keyed by the name you query them by, eg `posts` for `content.posts`. */
  collections: TCollections;
}

type SimplifyEach<TValue> = TValue extends object ? Simplify<TValue> : TValue;

/** The type a collection's queries return, eg `InferDocument<typeof posts>`. */
type InferDocument<TCollection> =
  TCollection extends Collection<infer TSchema, infer TOutput>
    ? unknown extends TOutput
      ? Document<TSchema>
      : SimplifyEach<Exclude<TOutput, Skipped>>
    : never;

type Content<TConfig extends Config = Config> = {
  [TName in keyof TConfig["collections"]]: CollectionQuery<
    InferDocument<TConfig["collections"][TName]>
  >;
};

function defineCollection<
  TSchema extends StandardSchema,
  TOutput = Document<TSchema>,
>(collection: Collection<TSchema, TOutput>): Collection<TSchema, TOutput> {
  return collection;
}

type InferredCollections<
  TSchemas extends Record<string, StandardSchema>,
  TOutputs extends { [TName in keyof TSchemas]: unknown },
> = {
  [TName in keyof TSchemas]: Collection<
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
    [TName in keyof TSchemas]: Omit<Collection<TSchemas[TName]>, "transform">;
  } & {
    [TName in keyof TOutputs]: {
      transform?: (
        document: Document<TSchemas[TName & keyof TSchemas]>,
        context: TransformContext
      ) => TOutputs[TName];
    };
  };
}): Config<InferredCollections<TSchemas, TOutputs>> {
  return config;
}

export {
  type Collection,
  type Content,
  type Config,
  defineCollection,
  defineConfig,
  type Document,
  type FileInfo,
  type InferDocument,
  Skipped,
  type StandardSchema,
  type TransformContext,
};

export type {
  CollectionQuery,
  FindManyArgs,
  OrderBy,
  Select,
  Where,
} from "./query";
