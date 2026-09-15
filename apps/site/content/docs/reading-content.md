---
title: Reading content
description: Get collections, documents and slugs.
section: Guides
order: 3
---

Everything is built ahead of time, so reading is synchronous. Import `collections` from server code only: in the browser bundle, every document would ship to the client.

## Collections

```ts
import { collections } from "tomekit/content";

collections.names(); // ["docs", "posts"], in config order
const posts = collections.get("posts");
```

A name from your config returns its collection. Any other string, eg a route param, returns the collection or `undefined`. `has` narrows a string to a collection name:

```ts
collections.get(params.collection); // a collection, or undefined

if (collections.has(params.collection)) {
  collections.get(params.collection).documents();
}
```

## Documents

```ts
posts.documents(); // every document, in the loader's order
posts.slugs(); // every slug, in the same order
posts.get("hello-world"); // the document
posts.get(params.slug); // the document, or undefined
```

`get` follows the same rule as for collections: a slug that exists returns the document, and any other string might return `undefined`. `has` narrows a string to a slug:

```ts
if (posts.has(params.slug)) {
  posts.get(params.slug).metadata.title;
}
```

Every document has four fields:

- `slug`: its key in the collection
- `metadata`: the schema's output, or what `transform` returned
- `body`: the text after the frontmatter, or what `transform` returned
- `file`: `{ name, path }`, or `undefined` when its loader gave no file

`documents()` returns a plain array, so sort and filter it like any other:

```ts
const latest = posts
  .documents()
  .toSorted((a, b) => b.metadata.date.getTime() - a.metadata.date.getTime());
```

To list every document, combine `names()` and `get()`:

```ts
collections.names().flatMap((name) => collections.get(name).documents());
```

## Types

The plugin writes the types to `.tomekit` and rewrites them when content changes.

```ts
import type { CollectionName, DocumentOf, SlugOf } from "tomekit/content";

const name: CollectionName = "posts";
const slug: SlugOf<"posts"> = "hello-world";

function title(post: DocumentOf<"posts">) {
  return post.metadata.title;
}
```

- Leave the name out to mean any collection, eg `DocumentOf` for a document from any collection.
- Read a part of a document from `DocumentOf`, eg `DocumentOf<"posts">["metadata"]`.

For a helper that works with any collection whose documents fit, type it as `Collection` from `tomekit`:

```ts
import type { Collection } from "tomekit";

function titles<TDocument extends { metadata: { title: string } }>(
  collection: Collection<TDocument>
) {
  return collection.documents().map((document) => document.metadata.title);
}

titles(collections.get("posts"));
```
