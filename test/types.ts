// Checked by `vp check`, never run: each line fails to compile if inference breaks.
import { z } from "zod";

import { defineCollection, defineConfig } from "../src/index";
import type { Content } from "../src/index";

const posts = defineCollection({
  directory: "content/posts",
  include: "*.md",
  name: "posts",
  schema: z.object({
    date: z.coerce.date(),
    tags: z.array(z.string()),
    title: z.string(),
  }),
  transform: (document, { skip }) =>
    document.title === ""
      ? skip()
      : { date: document.date, tags: document.tags, title: document.title },
});

const notes = defineCollection({
  directory: "content/notes",
  include: "*.md",
  name: "notes",
  schema: z.object({ order: z.number() }),
});

const config = defineConfig({ collections: [posts, notes] });

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
