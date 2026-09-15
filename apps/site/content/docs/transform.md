---
title: Transform
description: Parse Markdown once, at build time.
section: Guides
order: 2
---

`transform` runs on each document at build time, after the schema. Do the expensive work here, eg rendering Markdown, so pages only read the result.

## Returning metadata and body

`transform` receives the source, `{ slug, metadata, body, file }`, and returns a new `metadata` and/or `body`. Whatever it leaves out stays as it was, and the types of what it returns become the document's.

```ts
import { marked } from "marked";

export default defineConfig({
  collections: {
    posts: {
      loader: directory("content/posts"),
      schema: z.object({ title: z.string() }),
      transform: ({ body, metadata, slug }, { collection }) => ({
        body: marked.parse(body, { async: false }),
        metadata: { ...metadata, url: `/${collection}/${slug}` },
      }),
    },
  },
});
```

- Put derived values inside `metadata`. `slug` and `file` can't change, and any other top-level field is an error.
- Return data only: plain objects, arrays, strings, numbers, booleans, `null`, `Date`, `Map`, `Set`, `URL` and `RegExp`. A function or a class instance is an error that names its key path.
- `transform` can be `async`.
- In dev, a change reruns `transform` only for the entries whose data changed.

The second argument holds:

- `collection`: the collection's name
- `dev`: whether the Vite dev server is running
- `skip`: leaves the document out, see below

## Skipping a document

Return `skip()` to leave a document out of its collection. A reason is optional.

```ts
transform: ({ metadata }, { dev, skip }) =>
  metadata.draft && !dev ? skip("draft") : {},
```

A skipped document isn't in `documents()`, `slugs()` or the generated types. A [reference](/docs/collections#references) to it fails the build.

## Sharing a transform

To use one transform in several collections, write it as a generic function and type its first parameter as `Source`.

```ts
import type { Source, TransformContext } from "tomekit";

function withUrl<TMetadata extends object>(
  { metadata, slug }: Source<TMetadata>,
  { collection }: TransformContext
) {
  return { metadata: { ...metadata, url: `/${collection}/${slug}` } };
}
```

Each collection that uses `withUrl` keeps its own schema's fields, plus `url`.
