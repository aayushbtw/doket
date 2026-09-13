// Checked by `vp check`, never run: each line fails to compile if inference breaks.
import { z } from "zod";

import { defineCollection, defineConfig } from "../src/index";
import type {
  BaseDocument,
  Collection,
  Content,
  TransformContext,
} from "../src/index";

const config = defineConfig({
  collections: {
    notes: defineCollection({
      directory: "content/notes",
      schema: z.object({ order: z.number() }),
    }),
    posts: defineCollection({
      directory: "content/posts",
      include: "*.md",
      schema: z.object({
        date: z.coerce.date(),
        tags: z.array(z.string()),
        title: z.string(),
      }),
      transform: (document, { skip }) =>
        document.title === ""
          ? skip()
          : { date: document.date, tags: document.tags, title: document.title },
    }),
  },
});

declare const content: Content<typeof config>;

export const title: string | undefined = content.posts.all[0]?.title;
export const slug: string | undefined = content.notes.get("a")?.slug;
export const file: string | undefined = content.notes.all[0]?.file.path;
export const slugs: readonly string[] = content.notes.slugs;

const tagged = content.posts.all.find(
  (post): post is typeof post & { tags: [string, ...string[]] } =>
    post.tags.length > 0
);
export const firstTag: string | undefined = tagged?.tags[0];

// @ts-expect-error a skipped document is never part of the output
export const skipped: "skipped" = content.posts.all[0];

// @ts-expect-error unknown fields are rejected
export type Author = (typeof content.posts.all)[number]["author"];

// @ts-expect-error documents cannot be mutated through `all`
export type Push = (typeof content.posts.all)["push"];

// @ts-expect-error collections not in the config do not exist
export type Drafts = (typeof content)["drafts"];

// Collections with different documents can still be read together.
type AnyDocument =
  | (typeof content.notes.all)[number]
  | (typeof content.posts.all)[number];
export const everyDocument: AnyDocument[] = Object.values(content).flatMap(
  (collection): readonly AnyDocument[] => collection.all
);

// A generic helper takes any collection whose documents fit.
export function titles<TDocument extends { title: string }>(
  collection: Collection<TDocument>
): string[] {
  return collection.all.map((document) => document.title);
}

declare const slugged: Collection<{ title: string }, "a" | "b">;
export const sluggedTitles: string[] = titles(slugged);

// One transform shared by several collections keeps each schema's fields.
function withUrl<TDocument extends BaseDocument>(
  { content: _content, file: _file, ...document }: TDocument,
  { collection }: TransformContext
) {
  return { ...document, url: `/${collection}/${document.slug}` };
}

const inline = defineConfig({
  collections: {
    drafts: {
      directory: "content/drafts",
      schema: z.object({ title: z.string() }),
      transform: async (document, { skip }) => {
        await Promise.resolve();
        return document.title === "" ? skip() : { heading: document.title };
      },
    },
    named: {
      directory: "content/named",
      schema: z.object({ order: z.number() }),
      transform: (_document, { collection }) => {
        const name: "named" = collection;
        return { name };
      },
    },
    notes: defineCollection({
      directory: "content/notes",
      schema: z.object({ order: z.number() }),
    }),
    pages: {
      directory: "content/pages",
      schema: z.object({ order: z.number() }),
    },
    shared: {
      directory: "content/shared",
      schema: z.object({ order: z.number() }),
      transform: withUrl,
    },
  },
});

declare const inlineContent: Content<typeof inline>;

export const heading: string | undefined = inlineContent.drafts.all[0]?.heading;
export const pageOrder: number | undefined = inlineContent.pages.all[0]?.order;
export const noteSlug: string | undefined = inlineContent.notes.all[0]?.slug;

const [draft] = inlineContent.drafts.all;
// @ts-expect-error a transform's output replaces the document
export type DraftTitle = NonNullable<typeof draft>["title"];

export const sharedUrl: string | undefined = inlineContent.shared.all[0]?.url;
export const sharedOrder: number | undefined =
  inlineContent.shared.all[0]?.order;
