// Checked by `vp check`, never run: each line fails to compile if inference breaks.
import { z } from "zod";

import { defineCollection, defineConfig } from "../src/index";
import type { CollectionQuery, Content } from "../src/index";

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

export const title: string | undefined = content.posts.findFirst()?.title;
export const slug: string | undefined = content.notes.findFirst()?.slug;
export const file: string | undefined = content.notes.findFirst()?.file.path;
export const count: number = content.notes.count({
  where: { order: { gte: 1 } },
});

content.posts.findMany({
  orderBy: [{ date: "desc" }, { title: "asc" }],
  skip: 1,
  take: 5,
  where: {
    NOT: { title: { contains: "draft" } },
    date: { lt: new Date() },
    tags: { has: "vite" },
  },
});
content.posts.findMany({ where: (post) => post.tags.length > 0 });

const [picked] = content.posts.findMany({ select: { title: true } });
export const pickedTitle: string | undefined = picked?.title;
// @ts-expect-error unselected fields are not returned
export type Unpicked = NonNullable<typeof picked>["date"];

export const unique: string | undefined = content.posts.findUnique({
  where: { slug: "a" },
})?.title;

// @ts-expect-error a skipped document is never part of the output
export const skipped: "skipped" = content.posts.findMany()[0];

// @ts-expect-error unknown fields are rejected
content.posts.findMany({ where: { author: "me" } });

// @ts-expect-error `has` only applies to arrays
content.notes.findMany({ where: { order: { has: 1 } } });

// @ts-expect-error `contains` only applies to strings
content.notes.findMany({ where: { order: { contains: "1" } } });

// @ts-expect-error collections not in the config do not exist
export type Drafts = (typeof content)["drafts"];

// A generic helper that passes no `select` gets its own document type back.
export function titles<TDocument extends { title: string }>(
  collection: CollectionQuery<TDocument>
): string[] {
  return collection.findMany().map((document) => document.title);
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
    notes: defineCollection({
      directory: "content/notes",
      schema: z.object({ order: z.number() }),
    }),
    pages: {
      directory: "content/pages",
      schema: z.object({ order: z.number() }),
    },
  },
});

declare const inlineContent: Content<typeof inline>;

export const heading: string | undefined =
  inlineContent.drafts.findFirst()?.heading;
export const pageOrder: number | undefined =
  inlineContent.pages.findFirst()?.order;
export const noteSlug: string | undefined =
  inlineContent.notes.findFirst()?.slug;

const draft = inlineContent.drafts.findFirst();
// @ts-expect-error a transform's output replaces the document
export type DraftTitle = NonNullable<typeof draft>["title"];
