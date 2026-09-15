// Checked by `vp check`, never run: each line fails to compile if inference breaks.
import { z } from "zod";

import {
  defineCollection,
  defineConfig,
  defineLoader,
  directory,
} from "../src/index";
import { ContentError } from "../src/index";
import type {
  Collection,
  ContentSubject,
  FileInfo,
  Issue,
  InferDocument,
  Source,
  TransformContext,
  WithReferences,
} from "../src/index";

// What the generated `collections.get(name)` returns, without generated slug types.
declare function read<TCollection>(
  collection: TCollection
): Collection<InferDocument<TCollection>>;

const config = defineConfig({
  collections: {
    notes: defineCollection({
      loader: directory("content/notes"),
      schema: z.object({ order: z.number() }),
    }),
    posts: defineCollection({
      loader: directory("content/posts", { include: "*.md" }),
      schema: z.object({
        date: z.coerce.date(),
        tags: z.array(z.string()),
        title: z.string(),
      }),
      transform: ({ metadata }, { skip }) =>
        metadata.title === ""
          ? skip()
          : {
              metadata: {
                date: metadata.date,
                tags: metadata.tags,
                title: metadata.title,
              },
            },
    }),
  },
});

const notes = read(config.collections.notes);

const posts = read(config.collections.posts);

const [firstPost] = posts.documents();

const [firstNote] = notes.documents();

export const title: string | undefined = firstPost?.metadata.title;

export const slug: string | undefined = notes.get("a")?.slug;

export const file: string | undefined = firstNote?.file.path;

export const body: string | undefined = firstNote?.body;

export const order: number | undefined = firstNote?.metadata.order;

export const slugs: readonly string[] = notes.slugs();

const tagged = posts
  .documents()
  .find(
    (
      post
    ): post is typeof post & { metadata: { tags: [string, ...string[]] } } =>
      post.metadata.tags.length > 0
  );

export const firstTag: string | undefined = tagged?.metadata.tags[0];

// @ts-expect-error a skipped document is never part of the output
export const skipped: "skipped" = firstPost;

type Post = NonNullable<typeof firstPost>;

// @ts-expect-error unknown metadata fields are rejected
export type Author = Post["metadata"]["author"];

// @ts-expect-error documents cannot be mutated through `documents()`
export type Push = ReturnType<typeof posts.documents>["push"];

// @ts-expect-error collections not in the config do not exist
export type Drafts = (typeof config.collections)["drafts"];

// A known slug returns its document; any other string may not exist until `has` says so.
declare const known: Collection<{ title: string }, "a" | "b", "a" | "b">;

declare const fromRoute: string;

export const knownTitle: string = known.get("a").title;

export const routeTitle: string | undefined = known.get(fromRoute)?.title;

// @ts-expect-error a slug from a plain string may not exist
export const uncheckedTitle: string = known.get(fromRoute).title;

export const checkedTitle: string = known.has(fromRoute)
  ? known.get(fromRoute).title
  : "";

// Collections with different documents can still be read together.
export const everyDocument: (Post | NonNullable<typeof firstNote>)[] = [
  ...notes.documents(),
  ...posts.documents(),
];

// A generic helper takes any collection whose documents fit.
export function titles<TDocument extends { title: string }>(
  collection: Collection<TDocument>
): string[] {
  return collection.documents().map((document) => document.title);
}

export const knownTitles: string[] = titles(known);

// One transform shared by several collections keeps each schema's fields.
function withUrl<TMetadata extends object>(
  { metadata, slug: key }: Source<TMetadata>,
  { collection }: TransformContext
) {
  return { metadata: { ...metadata, url: `/${collection}/${key}` } };
}

const inline = defineConfig({
  collections: {
    drafts: {
      loader: directory("content/drafts"),
      schema: z.object({ title: z.string() }),
      transform: async ({ metadata }, { skip }) => {
        await Promise.resolve();

        return metadata.title === ""
          ? skip()
          : { metadata: { heading: metadata.title } };
      },
    },
    named: {
      loader: directory("content/named"),
      schema: z.object({ order: z.number() }),
      transform: (_source, { collection }) => {
        const name: "named" = collection;

        return { metadata: { name } };
      },
    },
    notes: defineCollection({
      loader: directory("content/notes"),
      schema: z.object({ order: z.number() }),
    }),
    pages: {
      loader: directory("content/pages"),
      schema: z.object({ order: z.number() }),
    },
    rendered: {
      loader: directory("content/rendered"),
      schema: z.object({ order: z.number() }),
      transform: ({ body: text }) => ({ body: text.length }),
    },
    shared: {
      loader: directory("content/shared"),
      schema: z.object({ order: z.number() }),
      transform: withUrl,
    },
  },
});

const [draft] = read(inline.collections.drafts).documents();

export const heading: string | undefined = draft?.metadata.heading;

// @ts-expect-error a transform's metadata replaces the schema's
export type DraftTitle = NonNullable<typeof draft>["metadata"]["title"];

const [page] = read(inline.collections.pages).documents();

export const pageOrder: number | undefined = page?.metadata.order;

export const pageBody: string | undefined = page?.body;

const [rendered] = read(inline.collections.rendered).documents();

export const renderedBody: number | undefined = rendered?.body;

export const renderedOrder: number | undefined = rendered?.metadata.order;

const [shared] = read(inline.collections.shared).documents();

export const sharedUrl: string | undefined = shared?.metadata.url;

export const sharedOrder: number | undefined = shared?.metadata.order;

export const extraField = defineCollection({
  loader: directory("content/extra"),
  schema: z.object({}),
  // @ts-expect-error a transform cannot add fields documents do not have
  transform: () => ({ url: "/extra" }),
});

// A union schema keeps each member's fields, with or without a transform.
const unions = defineConfig({
  collections: {
    media: {
      loader: directory("content/media"),
      schema: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("video"), url: z.string() }),
        z.object({ kind: z.literal("quote"), text: z.string() }),
      ]),
    },
    shared: {
      loader: directory("content/shared"),
      schema: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("video"), url: z.string() }),
        z.object({ kind: z.literal("quote"), text: z.string() }),
      ]),
      transform: ({ metadata }) =>
        metadata.kind === "video"
          ? { metadata: { src: metadata.url } }
          : { metadata: { quote: metadata.text } },
    },
  },
});

const [media] = read(unions.collections.media).documents();

export const mediaText: string | undefined =
  media?.metadata.kind === "quote" ? media.metadata.text : media?.slug;

const [sharedMedia] = read(unions.collections.shared).documents();

export const sharedSrc: string | undefined =
  sharedMedia !== undefined && "src" in sharedMedia.metadata
    ? sharedMedia.metadata.src
    : sharedMedia?.metadata.quote;

// A schema must produce an object, since its output becomes the document's metadata.
export const stringCollection = defineCollection({
  loader: directory("content/bad"),
  // @ts-expect-error a schema that produces a string is rejected
  schema: z.string(),
});

export const stringConfig = defineConfig({
  collections: {
    bad: {
      loader: directory("content/bad"),
      // @ts-expect-error a schema that produces a string is rejected
      schema: z.string(),
    },
  },
});

// Globs suggest common patterns but accept any string.
export const globbed = defineCollection({
  loader: directory("content/notes", {
    exclude: ["drafts/**"],
    include: "**/*.markdown",
  }),
  schema: z.object({}),
});

// A loader written in the config types documents the same way, without a file.
const generated = defineConfig({
  collections: {
    pages: {
      loader: {
        load: () => ({ entries: [{ metadata: { title: "A" }, slug: "a" }] }),
        watch: "data/*.json",
      },
      schema: z.object({ title: z.string() }),
      transform: ({ file, metadata }) => ({
        metadata: { title: metadata.title, withFile: file !== undefined },
      }),
    },
    plain: {
      loader: {
        load: async () => {
          await Promise.resolve();

          return { entries: [] };
        },
      },
      schema: z.object({ order: z.number() }),
    },
  },
});

const [generatedPage] = read(generated.collections.pages).documents();

export const generatedTitle: string | undefined = generatedPage?.metadata.title;

export const generatedFile: FileInfo | undefined = generatedPage?.file;

// @ts-expect-error an entry from code may have no file
export const generatedPath: string = generatedPage?.file.path ?? "";

const [plain] = read(generated.collections.plain).documents();

export const plainOrder: number | undefined = plain?.metadata.order;

export const loaderResult = defineCollection({
  loader: {
    // @ts-expect-error `load` returns an object with entries, not an array
    load: () => [{ slug: "a" }],
  },
  schema: z.object({}),
});

// `defineCollection` with an inline loader types `file` as maybe missing, not `never`.
const inlineCollection = defineCollection({
  loader: { load: () => ({ entries: [{ slug: "a" }] }) },
  schema: z.object({}),
});

const inlineFile = read(inlineCollection).documents()[0]?.file;

export const inlinePath: string =
  inlineFile === undefined ? "" : inlineFile.path;

// A `ContentError` can be built from the exported subject and issue types.
const subject: ContentSubject = { collection: "pages", slug: "a" };

const issue: Issue = { line: 1, message: "title: expected a string" };

export const contentMessage: string = new ContentError(subject, issue).message;

// References type the fields they name as the target's slugs, and keep each transform's output type.
const referencing = defineConfig({
  collections: {
    authors: defineCollection({
      loader: directory("content/authors"),
      schema: z.object({ name: z.string() }),
    }),
    posts: {
      loader: directory("content/posts"),
      schema: z.object({
        author: z.string(),
        date: z.coerce.date(),
        editor: z.string().optional(),
        order: z.number(),
        sections: z.array(z.object({ author: z.string(), title: z.string() })),
        tags: z.array(z.string()),
      }),
      transform: ({ metadata, slug: key }) => ({
        metadata: { ...metadata, url: `/posts/${key}` },
      }),
    },
  },
  references: {
    posts: {
      author: "authors",
      editor: "authors",
      "sections.author": "authors",
      tags: "authors",
    },
  },
});

type ReferencedPost = WithReferences<
  InferDocument<typeof referencing.collections.posts>,
  NonNullable<typeof referencing.references>["posts"],
  { authors: "ada" | "grace" }
>;

declare const referencedPost: ReferencedPost;

export const referencedAuthor: "ada" | "grace" = referencedPost.metadata.author;

export const referencedEditor: "ada" | "grace" | undefined =
  referencedPost.metadata.editor;

export const referencedSections: ("ada" | "grace")[] =
  referencedPost.metadata.sections.map((section) => section.author);

export const sectionTitle: string | undefined =
  referencedPost.metadata.sections[0]?.title;

export const referencedTags: ("ada" | "grace")[] = referencedPost.metadata.tags;

export const referencedUrl: string = referencedPost.metadata.url;

export const referencedDate: Date = referencedPost.metadata.date;

// @ts-expect-error a field no reference names keeps its type
export const unreferencedOrder: string = referencedPost.metadata.order;

// Without references, documents keep their types.
declare const unreferenced: WithReferences<
  Post,
  NonNullable<typeof config.references>,
  { authors: "ada" }
>;

export const unreferencedTitle: string = unreferenced.metadata.title;

const people = defineCollection({
  loader: directory("content/people"),
  schema: z.object({
    date: z.coerce.date(),
    mentor: z.string(),
    order: z.number(),
  }),
});

export const nonString = defineConfig({
  collections: { people },
  references: {
    people: {
      // @ts-expect-error a reference names a field of strings
      order: "people",
    },
  },
});

export const intoDate = defineConfig({
  collections: { people },
  references: {
    people: {
      // @ts-expect-error a reference does not reach into a Date
      "date.x": "people",
    },
  },
});

export const unknownTarget = defineConfig({
  collections: { people },
  references: {
    people: {
      // @ts-expect-error a reference points at a collection in the config
      mentor: "persons",
    },
  },
});

export const unknownSource = defineConfig({
  collections: { people },
  references: {
    // @ts-expect-error references are keyed by a collection in the config
    persons: { mentor: "people" },
  },
});

// `defineLoader` keeps a shared loader's file type: required when its entries set files.
const withFiles = defineLoader({
  load: () => ({
    entries: [{ file: { name: "a.md", path: "content/a.md" }, slug: "a" }],
  }),
});

export const sharedPath: string | undefined = read(
  defineCollection({ loader: withFiles, schema: z.object({}) })
).documents()[0]?.file.path;

// …and `undefined` when they set none.
const withoutFiles = defineLoader({
  load: () => ({ entries: [{ slug: "a" }] }),
});

export const sharedFile: undefined = read(
  defineCollection({ loader: withoutFiles, schema: z.object({}) })
).documents()[0]?.file;
