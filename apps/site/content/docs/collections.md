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
