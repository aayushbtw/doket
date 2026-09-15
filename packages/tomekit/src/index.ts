import type { Glob } from "./directory";
import type { Prettify } from "./query";
import type { Skipped } from "./skipped";
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
 * A document before `transform`: its metadata as the schema produced it, and
 * the entry's body.
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
interface Source<
  TMetadata = unknown,
  TFile extends FileInfo | undefined = FileInfo | undefined,
> {
  /** The entry's body, eg a file's text after the frontmatter block. */
  body: string;
  /** Where the entry's file lives, or `undefined` when its loader gave none. */
  file: TFile;
  /** The entry's metadata, as the collection's schema produced it. */
  metadata: TMetadata;
  /** The document's key in its collection, eg `guides/setup`. */
  slug: string;
}

/**
 * One document as a loader returns it, before the schema and `transform`.
 *
 * @example
 * ```ts
 * const hello: Entry = { body: "# Hello", metadata: { title: "Hello" }, slug: "hello" };
 * ```
 */
interface Entry<TFile extends FileInfo | undefined = FileInfo | undefined> {
  /**
   * Becomes the document's `body`, eg a file's text after the frontmatter.
   *
   * @default ""
   */
  body?: string;
  /** Where the entry's file lives, when it has one. */
  file?: TFile;
  /**
   * Validated by the collection's schema next.
   *
   * @default {}
   */
  metadata?: object;
  /** The document's key in its collection, eg `guides/setup`. A non-empty string, unique in the collection. */
  slug: string;
}

/**
 * What a loader's `load` receives.
 *
 * @example
 * ```ts
 * const pages: Loader = {
 *   load: async ({ collection, root }) => ({
 *     entries: JSON.parse(await readFile(path.join(root, `data/${collection}.json`), "utf-8")),
 *   }),
 * };
 * ```
 */
interface LoadContext {
  /** The name of the collection, eg `posts`. */
  collection: string;
  /** The project root, as an absolute path. */
  root: string;
}

/**
 * A problem a loader found, eg a file whose frontmatter does not parse. tomekit reports it like a schema error.
 *
 * @example
 * ```ts
 * const pages: Loader = {
 *   load: () => ({ entries: [], issues: [{ message: "draft has no title. Add one", slug: "draft" }] }),
 * };
 * // collections.get("pages").get("draft"): draft has no title. Add one
 * ```
 */
interface LoadIssue {
  /** What went wrong underneath, eg the error `readFile` threw. Becomes the `ContentError`'s `cause`. */
  cause?: unknown;
  /** Starts at 1. */
  column?: number;
  /** The entry's file, relative to the project root. */
  file?: string;
  /** Starts at 1. */
  line?: number;
  /** What went wrong, then what to do, eg `title: expected a string. Add a title`. */
  message: string;
  /** The entry's slug, for an entry without a file. */
  slug?: string;
}

/**
 * What `load` returns.
 *
 * @example
 * ```ts
 * const pages: Loader = {
 *   load: () => ({
 *     entries: [{ slug: "hello" }],
 *     warnings: ["pages: the API is unreachable, so these pages come from the cache"],
 *   }),
 * };
 * ```
 */
interface LoadResult<
  TFile extends FileInfo | undefined = FileInfo | undefined,
> {
  /** In the order `documents()` returns them. */
  entries: readonly Entry<TFile>[];
  /** Entries that could not be loaded. The rest still load. */
  issues?: readonly LoadIssue[];
  /** Printed as they are. Say what happens because of them, eg `directory "x" does not exist, so collections.get("x") is empty`. */
  warnings?: readonly string[];
}

/**
 * Where a collection's entries come from. {@link directory} reads files;
 * write your own to load entries from code, eg an API.
 *
 * @example
 * ```ts
 * const pages: Loader = {
 *   load: () => ({
 *     entries: [{ body: "# Hello", metadata: { title: "Hello" }, slug: "hello" }],
 *   }),
 * };
 * ```
 */
interface Loader<TFile extends FileInfo | undefined = FileInfo | undefined> {
  /** Runs on every build, and in dev again when the config or a `watch` file changes. Throwing fails the whole collection. */
  load: (
    context: LoadContext
  ) => LoadResult<TFile> | PromiseLike<LoadResult<TFile>>;
  /** Glob patterns, relative to the project root, of files whose changes rerun `load` in dev, eg `"data/*.json"`. Start a pattern with `!` to leave matching files out, eg `"!data/drafts/**"`. */
  watch?: Glob | readonly Glob[];
}

/** The second argument to `transform`. */
interface TransformContext<TName extends string = string> {
  /** The name of the collection, eg `posts`. */
  collection: TName;
  /**
   * Leaves this entry out of the collection. Return its result.
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

/** One collection: where its entries come from, how to validate them and what to return. */
interface CollectionConfig<
  TSchema extends StandardSchema<object> = StandardSchema<object>,
  TOutput = unknown,
  TFile extends FileInfo | undefined = FileInfo | undefined,
> {
  /** Where the entries come from, eg `directory("content/posts")`. */
  loader: Loader<TFile>;
  /** Validates each entry's metadata, and must produce an object. A file without frontmatter is validated as `{}`. */
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
  // `PromiseLike`, not `Promise`: it still allows async transforms, and only adds `then` to the editor's suggestions for the returned object.
  // A method, not a function property: methods are checked bivariantly, so a config with files still fits `CollectionConfig`.
  transform?(
    source: Source<InferOutput<TSchema>, TFile>,
    context: TransformContext
  ): TOutput | PromiseLike<TOutput>;
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
type DocumentFrom<TMetadata, TResult, TFile> = TResult extends unknown
  ? {
      body: TResult extends { body: infer TBody } ? TBody : string;
      file: TFile;
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
  TCollection extends CollectionConfig<
    infer TSchema,
    infer TOutput,
    infer TFile
  >
    ? DocumentFrom<
        InferOutput<TSchema>,
        IsUntransformed<TOutput> extends true
          ? Record<never, never>
          : Exclude<Awaited<TOutput>, Skipped>,
        TFile
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
 *   loader: directory("content/posts"),
 *   schema: z.object({ title: z.string() }),
 * });
 *
 * export default defineConfig({ collections: { posts } });
 * ```
 */
function defineCollection<
  TSchema extends StandardSchema<object>,
  TOutput extends TransformOutput = TransformOutput,
  TFile extends FileInfo | undefined = FileInfo | undefined,
>(
  collection: CollectionConfig<TSchema, TOutput, TFile>
): CollectionConfig<TSchema, TOutput, TFile> {
  return collection;
}

/**
 * Defines a loader outside a collection, eg one several collections share,
 * with its file type inferred from the entries it returns.
 *
 * @example
 * ```ts
 * export const pages = defineLoader({
 *   load: () => ({ entries: [{ body: "# Hello", slug: "hello" }] }),
 * });
 *
 * export default defineConfig({
 *   collections: { pages: { loader: pages, schema: z.object({}) } },
 * });
 * ```
 */
// Defaults to `undefined`, so a loader whose entries set no `file` gives documents without one.
function defineLoader<TFile extends FileInfo | undefined = undefined>(
  loader: Loader<TFile>
): Loader<TFile> {
  return loader;
}

// A file type inferred from a loader, or `FileInfo | undefined` when nothing could be inferred, eg from an inline `load`.
type FileOf<TFile> = unknown extends TFile
  ? FileInfo | undefined
  : Extract<TFile, FileInfo | undefined>;

type InferredCollections<
  TSchemas extends Record<string, StandardSchema>,
  TOutputs extends { [TName in keyof TSchemas]: unknown },
  TFiles extends { [TName in keyof TSchemas]: unknown },
> = {
  [TName in keyof TSchemas]: CollectionConfig<
    Extract<TSchemas[TName], StandardSchema<object>>,
    Awaited<TOutputs[TName]>,
    FileOf<TFiles[TName]>
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
 *       loader: directory("content/posts"),
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
  TFiles extends { [TName in keyof TSchemas]: unknown },
>(config: {
  collections: {
    [TName in keyof TSchemas]: {
      /** Validates each entry's metadata, and must produce an object. A file without frontmatter is validated as `{}`. */
      schema: TSchemas[TName] & StandardSchema<object>;
    };
  } & {
    [TName in keyof TFiles]: {
      /** Where the entries come from, eg `directory("content/posts")`. */
      loader: Loader<FileOf<TFiles[TName]>>;
    };
  } & {
    [TName in keyof TOutputs]: {
      /** Changes each document at build time. Return a new `metadata` and/or `body`, and their types become the document's. */
      transform?: (
        source: Source<
          InferOutput<TSchemas[TName & keyof TSchemas]>,
          FileOf<TFiles[TName & keyof TFiles]>
        >,
        context: TransformContext<TName & string>
      ) => TOutputs[TName];
    };
  };
}): Config<InferredCollections<TSchemas, TOutputs, TFiles>>;
// Loose on purpose: the parameter's `schema` intersection never matches the inferred return type.
function defineConfig(config: Config): Config {
  return config;
}

export {
  type CollectionConfig,
  type Config,
  defineCollection,
  defineConfig,
  defineLoader,
  type Entry,
  type FileInfo,
  type InferDocument,
  type LoadContext,
  type Loader,
  type LoadIssue,
  type LoadResult,
  type Skipped,
  type Source,
  type StandardSchema,
  type TransformContext,
  type TransformResult,
  type WithSlug,
};

export { directory, type DirectoryOptions } from "./directory";

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

export type { ContentSubject, Issue } from "./errors";
