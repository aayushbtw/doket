import type { CollectionQuery } from "./query";

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

type Document<TSchema> = Omit<
  InferOutput<TSchema>,
  "content" | "file" | "slug"
> & {
  /** The file's body, after the frontmatter block. */
  content: string;
  file: FileInfo;
  /**
   * The frontmatter `slug` when it is a string, otherwise the path inside the
   * collection directory without the extension, eg `guides/setup`.
   */
  slug: string;
};

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
  TName extends string = string,
  TSchema extends StandardSchema = StandardSchema,
  TOutput = unknown,
> {
  /** Relative to the project root. */
  directory: string;
  /** Glob patterns relative to `directory` to leave out. */
  exclude?: string | readonly string[];
  /** Glob patterns relative to `directory`. */
  include: string | readonly string[];
  /** The key the collection is read by, eg `content.posts`. */
  name: TName;
  schema: TSchema;
  transform?: (
    document: Document<TSchema>,
    context: TransformContext
  ) => TOutput | Promise<TOutput>;
}

interface Config<
  TCollections extends readonly Collection[] = readonly Collection[],
> {
  collections: TCollections;
}

/**
 * Augment this with your config's type to type `tomekit/content`:
 *
 * ```ts
 * declare module "tomekit" {
 *   interface Register {
 *     config: typeof config;
 *   }
 * }
 * ```
 */
// Empty on purpose: it only exists to be augmented.
// oxlint-disable-next-line typescript/no-empty-object-type, typescript/no-empty-interface
interface Register {}

type RegisteredConfig = Register extends {
  config: infer TConfig extends Config;
}
  ? TConfig
  : Config;

type Output<TCollection> =
  TCollection extends Collection<string, infer TSchema, infer TOutput>
    ? unknown extends TOutput
      ? Document<TSchema>
      : Exclude<TOutput, Skipped>
    : never;

type Content<TConfig extends Config = RegisteredConfig> = {
  [
    TCollection in TConfig["collections"][number] as TCollection["name"]
  ]: CollectionQuery<Output<TCollection>>;
};

function defineCollection<
  const TName extends string,
  TSchema extends StandardSchema,
  TOutput = Document<TSchema>,
>(
  collection: Collection<TName, TSchema, TOutput>
): Collection<TName, TSchema, TOutput> {
  return collection;
}

function defineConfig<const TCollections extends readonly Collection[]>(
  config: Config<TCollections>
): Config<TCollections> {
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
  type Register,
  Skipped,
  type StandardSchema,
  type TransformContext,
};

export type { CollectionQuery, FindManyArgs, OrderBy, Where } from "./query";
