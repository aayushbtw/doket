# tomekit

Typed content collections for Vite. Parsed at build, nothing at runtime.

Point tomekit at a folder of Markdown files and a schema. At build time it reads every file, validates its frontmatter, runs your transform, and hands the result to your app as plain data. Your server never parses a file, so it works the same on Node, Cloudflare Workers, or anything else without a filesystem.

```ts
import { collections } from "tomekit/content";

const posts = collections.get("posts");

posts.documents().filter((post) => post.metadata.tags.includes("vite"));
posts.get("hello-world").metadata.title;
```

## Why tomekit

- **It is only a Vite plugin.** There is no separate CLI or watcher process. Content reloads with the rest of your dev server.
- **It ships data, not a parser.** Frontmatter is parsed and validated during the build, so a typo fails the build, not a request.
- **It does not render Markdown.** Your transform gets the raw body and you parse it with whatever you already use. That is also why tomekit has one dependency.
- **It works with any validator.** Schemas use [Standard Schema](https://standardschema.dev), so Zod, Valibot and ArkType all work.
- **Your content stays out of generated files.** Only types are generated, into a gitignored folder. Documents are served by the plugin, so a post edit never rewrites anything on disk.

## Install

```sh
pnpm add tomekit
```

Requires Node 22.17 or later and Vite 8 or later.

## Setup

**1. Define your collections** in `tomekit.config.ts` at the project root:

```ts
import { defineCollection, defineConfig } from "tomekit";
import { z } from "zod";

export default defineConfig({
  collections: {
    posts: defineCollection({
      directory: "content/posts",
      schema: z.object({
        title: z.string(),
        publishedAt: z.coerce.date(),
      }),
    }),
  },
});
```

**2. Add the plugin** to `vite.config.ts`:

```ts
import { tomekit } from "tomekit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tomekit()],
});
```

**3. Point TypeScript at the generated types** in `tsconfig.json`, and ignore the folder in `.gitignore`:

```json
{
  "compilerOptions": {
    "paths": { "tomekit/content*": ["./.tomekit/content*"] }
  }
}
```

```
.tomekit
```

**4. Read your content** anywhere in your app:

```ts
import { collections } from "tomekit/content";

const post = collections.get("posts").get(slug);
```

Whenever content loads, the plugin writes the types for every collection to `.tomekit/content.d.ts`: what each document looks like and which slugs exist. The file is rewritten only when a collection or a slug changes. Importing `tomekit/content` without the plugin throws an error that says so.

## Documents

Every document in every collection has the same four fields:

| Field | Value |
| --- | --- |
| `slug` | The frontmatter `slug` if it has one, otherwise the path inside the collection directory without the extension, eg `guides/setup` |
| `metadata` | The frontmatter, as your schema validated it |
| `body` | The file's text after the frontmatter block, or what your transform returned as `body` |
| `file` | `{ name, path }`: the file name, and its path relative to the project root |

```ts
const post = collections.get("posts").get("hello-world");

post.slug; // "hello-world"
post.metadata.title; // typed from your schema
post.body; // the Markdown
```

Frontmatter lives under `metadata`, so any field name works, including `body` or `file`. A file without frontmatter is validated as an empty object.

## Types

`tomekit/content` exports one type per concept. Pass a collection name, or leave it out to mean any collection.

| Type | Is |
| --- | --- |
| `CollectionName` | Any collection's name, eg `"notes" \| "posts"` |
| `DocumentOf<"posts">` | A document in `posts`. `DocumentOf` is a document in any collection |
| `SlugOf<"posts">` | A slug in `posts`, eg `"hello-world" \| "setup"`. `SlugOf` is any slug |

```ts
import type { DocumentOf } from "tomekit/content";

function title(post: DocumentOf<"posts">) {
  return post.metadata.title;
}
```

`get` and `has` suggest the names and slugs that exist as you type. The types only update while Vite is running, so after a fresh clone, run `vite dev` or `vite build` once before `tsc`.

## Reading content

Everything starts from `collections`. Each member is named after what it returns, and the data is built ahead of time, so everything is synchronous.

|  | `collections` | A collection |
| --- | --- | --- |
| List | `names()`: collection names, in config order | `slugs()`: slugs, in file name order |
| One | `get(name)`: a collection | `get(slug)`: a document |
| Check | `has(name)` | `has(slug)` |
| Documents |  | `documents()`: every document, in file name order |

```ts
import { collections } from "tomekit/content";

const posts = collections.get("posts");

posts.documents(); // DocumentOf<"posts">[]
posts.get("hello-world"); // DocumentOf<"posts">
posts.slugs(); // SlugOf<"posts">[]
collections.names(); // CollectionName[]
```

`get` with a key that exists, eg a slug you wrote out, returns the value. Any other string, eg a route param, may not exist: `get` returns the value or `undefined`, and `has` narrows the string to a key that exists.

```ts
const post = posts.get(params.slug);
if (!post) throw notFound();

if (collections.has(params.collection)) {
  collections.get(params.collection).get(params.slug);
}
```

`documents()` returns a plain array, so a query is ordinary JavaScript, and a reusable query is a function:

```ts
const newest = <T extends { metadata: { publishedAt: Date } }>(
  documents: readonly T[]
) =>
  documents.toSorted(
    (a, b) =>
      b.metadata.publishedAt.getTime() - a.metadata.publishedAt.getTime()
  );

newest(posts.documents()).slice(0, 5);
```

To read every collection together, eg for a sitemap or a feed, combine `names()` and `get()`:

```ts
collections
  .names()
  .flatMap((name) => collections.get(name).documents())
  .map((document) => document.metadata.url);
```

## Collection options

Each key in `collections` is the collection's name, eg `posts` for `collections.get("posts")`. Names use letters, digits and `_` and start with a letter, so `blogPosts` works but `blog-posts` fails with a message saying why. Write each one inline, or wrap it in `defineCollection` to define it in its own file. Either way `transform` knows your schema's types.

| Option | Required |  |
| --- | --- | --- |
| `directory` | yes | Where the files live, relative to the project root |
| `include` | no | A glob or globs relative to `directory`. Defaults to `"**/*.md"` |
| `exclude` | no | A glob or globs relative to `directory` to leave out |
| `schema` | yes | Any [Standard Schema](https://standardschema.dev) for the frontmatter |
| `transform` | no | Changes each document at build time, see [Transform](#transform) |

## Transform

`transform` runs once per file at build time. It receives the document as parsed and returns a new `metadata` and/or `body`. Whatever it leaves out stays as it was, and the types of what it returns become the document's. Use it to render Markdown, derive fields, or drop what you do not need.

```ts
import { marked } from "marked";

const posts = defineCollection({
  directory: "content/posts",
  schema: z.object({ title: z.string() }),
  transform: ({ body, metadata, slug }) => ({
    body: marked.parse(body, { async: false }),
    metadata: { ...metadata, url: `/posts/${slug}` },
  }),
});

collections.get("posts").get("hello-world").body; // the HTML
```

A transform cannot change `slug` or `file`, and cannot return other fields: derived values like `url` go inside `metadata`, and anything else fails that file with a message saying so. What it returns must be data: plain objects, arrays, strings, numbers, booleans, `null`, `undefined`, `Date`, `Map`, `Set`, `URL` and `RegExp`. Anything else, eg a class instance or a function, fails that file with the key it was found at.

### Sharing a transform

The second argument names the collection, so one function can serve several. Type its first argument as `Source` to keep each schema's metadata:

```ts
import type { Source, TransformContext } from "tomekit";

function withUrl<TMetadata extends object>(
  { body, metadata, slug }: Source<TMetadata>,
  { collection }: TransformContext
) {
  return {
    body: marked.parse(body, { async: false }),
    metadata: { ...metadata, url: `/${collection}/${slug}` },
  };
}

// collections: { posts: { ..., transform: withUrl }, notes: { ..., transform: withUrl } }
```

### Skipping files

Return `skip()` from the transform to leave a file out, eg drafts. Return `{}` to keep a document as it is:

```ts
transform: ({ metadata }, { skip }) => (metadata.draft ? skip("draft") : {}),
```

## Errors

A build lists every broken file at once, one problem per line, pointing at the line and column in the file:

```
2 content files have errors:
content/posts/hello.md:2:1: title: Invalid input: expected string, received undefined
content/posts/setup.md:4:5: tags.1: Invalid input: expected string, received number
```

In dev, the same errors are logged and shown in Vite's error overlay, and only those files are left out, so the rest of your site keeps working while you fix them. Two files with the same slug, and a transform that throws or returns the wrong shape, are handled the same way.

tomekit also warns when:

- a collection's `directory` does not exist, or no files in it match `include`, so the collection is empty
- `tomekit/content` is imported in the browser bundle, which would ship its documents to the client
- `tsconfig.json` has no `tomekit/content*` path, so imports have no collection types

A config that fails to load, eg a typo in `tomekit.config.ts`, fails `vite build` and is logged as soon as the dev server starts.

Every error tomekit throws extends `TomekitError`, and each class is exported from `tomekit`, so you can check `instanceof BrokenContentError` rather than the message. When you call `build()` from code, Vite wraps plugin errors, so look for tomekit's in the `errors` array of what it throws.

While the dev server runs, saving a file only re-runs that file's transform and rewrites the types right away, without waiting for a page to load. Files that do not match a collection's `include` never trigger a reload.

## Options

```ts
tomekit({ config: "tomekit.config.ts", types: ".tomekit" });
```

| Option | Default |  |
| --- | --- | --- |
| `config` | `"tomekit.config.ts"` | Path to the config file, relative to the Vite root |
| `types` | `".tomekit"` | The folder generated types are written to, or `false` to skip them. Update the tsconfig `paths` entry to match |

## Not in scope

tomekit stays small on purpose. It does not render MDX, process images, or resolve references between collections. Those belong in your transform or in a tool built for them.

## License

MIT
