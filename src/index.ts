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

interface Meta {
  /** The file name with its extension, eg `my-post.md`. */
  fileName: string;
  /** Relative to the project root. */
  filePath: string;
  /** Relative to the collection directory, without the extension. */
  slug: string;
}

type Document<TSchema> = InferOutput<TSchema> & {
  /** The file's body, after the frontmatter block. */
  content: string;
  _meta: Meta;
};

interface Collection<
  TName extends string = string,
  TSchema extends StandardSchema = StandardSchema,
  TOutput = unknown,
> {
  directory: string;
  include: string;
  name: TName;
  schema: TSchema;
  transform?: (document: Document<TSchema>) => TOutput | Promise<TOutput>;
}

interface Config<TCollections extends readonly Collection[] = Collection[]> {
  collections: TCollections;
}

interface CollectionApi<TOutput> {
  /** Every document, in file name order. */
  all: () => TOutput[];
  get: (slug: string) => TOutput | undefined;
}

type Collections<TConfig extends Config> = {
  [
    TCollection in TConfig["collections"][number] as TCollection["name"]
  ]: CollectionApi<
    TCollection extends Collection<string, infer TSchema, infer TOutput>
      ? unknown extends TOutput
        ? Document<TSchema>
        : TOutput
      : never
  >;
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
  type CollectionApi,
  type Collections,
  type Config,
  defineCollection,
  defineConfig,
  type Document,
  type Meta,
  type StandardSchema,
};
