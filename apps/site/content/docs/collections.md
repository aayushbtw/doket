---
title: Collections and schemas
description: Group entries under one schema, from files or any loader.
section: Guides
order: 1
---

A collection has a `loader`, which says where its entries come from, and a `schema`, which validates each entry's metadata.

## Loaders

### Files in a directory

`directory()` loads each Markdown file in a folder. Its frontmatter becomes the metadata and the rest becomes the body. The slug is the frontmatter's `slug`, or the file's path without the extension.

```ts
import { defineConfig, directory } from "tomekit";
import { z } from "zod";

export default defineConfig({
  collections: {
    posts: {
      loader: directory("content/posts", { exclude: "drafts/**" }),
      schema: z.object({ title: z.string() }),
    },
  },
});
```

`include` defaults to `"**/*.md"`. Both options take one glob or a list, relative to the directory.

### Your own loader

A loader is an object with a `load` function that returns `entries`. Use it for content that isn't a folder of Markdown, eg JSON or an API.

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";

export default defineConfig({
  collections: {
    authors: {
      loader: {
        load: async ({ root }) => ({
          entries: JSON.parse(
            await readFile(path.join(root, "data/authors.json"), "utf-8")
          ),
        }),
        watch: "data/authors.json",
      },
      schema: z.object({ name: z.string() }),
    },
  },
});
```

Each entry has a `slug`, and optionally `metadata`, `body` and `file`. `load` receives:

- `collection`: the collection's name
- `root`: the project root, as an absolute path
- `dev`: whether the Vite dev server is running

Return `issues` for entries that couldn't load and `warnings` for anything else worth saying. The other entries still load. A `load` that throws fails the whole collection.

### Reloading in dev

`watch` lists globs, relative to the project root, whose changes rerun `load`. Start a pattern with `!` to leave files out. `directory()` watches its own files. A loader without `watch` reruns only when the config changes.

### Sharing a loader

`defineLoader` keeps a loader's types when it lives outside the config, eg in its own file.

```ts
import { defineLoader } from "tomekit";

export const authors = defineLoader({
  load: () => ({ entries: [{ metadata: { name: "Ada" }, slug: "ada" }] }),
});
```

To combine sources in one collection, call another loader's `load` inside yours and add your entries to its result.

## Schema

## References

`references` names the metadata fields that hold slugs of another collection. It sits next to `collections`, keyed by collection name and then by key path.

```ts
export default defineConfig({
  collections: {
    authors: {
      loader: directory("content/authors"),
      schema: z.object({ name: z.string() }),
    },
    posts: {
      loader: directory("content/posts"),
      schema: z.object({
        author: z.string(),
        sections: z.array(z.object({ author: z.string(), title: z.string() })),
      }),
    },
  },
  references: {
    posts: { author: "authors", "sections.author": "authors" },
  },
});
```

- A path goes through nested objects and arrays, eg `sections.author`. TypeScript accepts only paths to strings or arrays of strings, and names from `collections`.
- Every slug must belong to a document that `collections.get("authors")` returns, so a skipped or broken author doesn't count. Otherwise `vite build` fails, pointing at the file and line. Dev leaves the post out and shows the error in the overlay.
- The check runs on documents after `transform`, and only on strings, so a transform can replace a slug with something else.

In the generated types the field holds that collection's slugs, so following it needs no `undefined` check:

```ts
const post = collections.get("posts").get("hello");

collections.get("authors").get(post.metadata.author).metadata.name;
```

Inside `transform`, `metadata.author` is still a `string`: the check runs after every transform, since a transform's `skip()` decides which slugs exist.
