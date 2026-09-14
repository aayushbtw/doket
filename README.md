# tomekit

Typed content collections for Vite. Parsed at build, nothing at runtime.

Point tomekit at a folder of Markdown files and a schema. At build time it reads every file, validates its frontmatter, runs your transform, and hands the result to your app as plain data. Your server never parses a file, so it works the same on Node, Cloudflare Workers, or anything else without a filesystem.

```ts
import { content } from "tomekit/content";

content.posts.all.filter((post) => post.tags.includes("vite"));
content.posts.get("hello-world");
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
import { content } from "tomekit/content";

const post = content.posts.get(slug);
```

Whenever content loads, the plugin writes types for every collection into `.tomekit/content`: what each document looks like and which slugs exist. They are rewritten only when a collection or a slug changes. Importing `tomekit/content` without the plugin throws an error that says so.

## Types

Each collection gets a document type and a slug type, named after its key in PascalCase. `AnyDocument` is a document from any collection, and `CollectionName` is any collection's key.

```ts
import { content, type Posts, type PostsSlug } from "tomekit/content";

function title(post: Posts) {
  return post.title;
}

post.slug; // PostsSlug, eg "hello-world" | "setup"
content.posts.get("hello-world"); // suggests PostsSlug values, accepts any string
```

The types only update while Vite is running, so after a fresh clone, run `vite dev` or `vite build` once before `tsc`.

## Reading content

Every collection has three members. The data is built ahead of time, so everything is synchronous.

```ts
content.posts.all; // readonly Posts[], in file name order
content.posts.get("hello-world"); // Posts | undefined
content.posts.slugs; // readonly PostsSlug[], in the same order as `all`
```

`all` is a plain array, so a query is ordinary JavaScript, and a reusable query is a function:

```ts
const newest = <T extends { publishedAt: Date }>(documents: readonly T[]) =>
  documents.toSorted(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
  );

newest(content.posts.all.filter((post) => post.tags.includes("vite"))).slice(
  0,
  5
);
```

To read several collections together, eg for a sitemap, use `map` then `flat`, which infers a union of every document type. `flatMap` takes the first collection's type and rejects the rest:

```ts
Object.values(content)
  .map((collection) => collection.all)
  .flat(); // (Posts | Notes)[]
```

To pick a collection by a name held in a variable, index `content`. A name typed as a collection name stays typed; a plain string, eg a route param, needs a check first:

```ts
import { content, type CollectionName } from "tomekit/content";

content[name].all; // name: CollectionName

function isCollection(name: string): name is CollectionName {
  return Object.hasOwn(content, name);
}

if (isCollection(params.collection)) {
  content[params.collection].get(params.slug);
}
```

Each collection is also its own module, so a file that needs one collection loads only that one:

```ts
import posts from "tomekit/content/posts";
```

## Collection options

Each key in `collections` is the name you query it by, eg `posts` for `content.posts`. Names use letters, digits and `_`, start with a letter, and must generate different types, so `blogPosts` works but `blog-posts`, or both `blog_posts` and `blogPosts`, fail with a message saying why. Write each one inline, or wrap it in `defineCollection` to define it in its own file. Either way `transform` knows your schema's types.

| Option | Required |  |
| --- | --- | --- |
| `directory` | yes | Where the files live, relative to the project root |
| `include` | no | A glob or globs relative to `directory`. Defaults to `"**/*.md"` |
| `exclude` | no | A glob or globs relative to `directory` to leave out |
| `schema` | yes | Any [Standard Schema](https://standardschema.dev) for the frontmatter |
| `transform` | no | Shapes each document at build time, see [Transform](#transform) |

## Documents

Without a transform, each document is your validated frontmatter plus three fields:

| Field | Value |
| --- | --- |
| `slug` | The frontmatter `slug` if it has one, otherwise the path inside the collection directory without the extension, eg `guides/setup` |
| `content` | The file's body, after the frontmatter block |
| `file.name` | The file name with its extension, eg `setup.md` |
| `file.path` | The path relative to the project root |

A file without frontmatter is validated as an empty object. Frontmatter named `content` or `file` is ignored with a warning, since tomekit sets those.

## Transform

`transform` runs once per file at build time and decides what your app receives. Use it to render Markdown, derive fields, or drop what you do not need. The result must be data: plain objects, arrays, strings, numbers, booleans, `null`, `undefined`, `Date`, `Map`, `Set`, `URL` and `RegExp`. Anything else, eg a class instance or a function, fails that file with the key it was found at.

```ts
import { marked } from "marked";

const posts = defineCollection({
  directory: "content/posts",
  schema: z.object({ title: z.string() }),
  transform: ({ content, slug, title }) => ({
    title,
    html: marked.parse(content, { async: false }),
    url: `/posts/${slug}`,
  }),
});
```

The return type of `transform` becomes the type of `all` and `get`. `get(slug)` keeps working even if your transform leaves `slug` out. A transform cannot change `slug`; set it in the frontmatter instead.

### Sharing a transform

The second argument names the collection, so one function can serve several. Type the document as `BaseDocument` or a subtype to keep each schema's fields:

```ts
import type { BaseDocument, TransformContext } from "tomekit";

function withUrl<T extends BaseDocument>(
  { content, file, ...document }: T,
  { collection }: TransformContext
) {
  return {
    ...document,
    html: marked.parse(content, { async: false }),
    url: `/${collection}/${document.slug}`,
  };
}

// collections: { posts: { ..., transform: withUrl }, notes: { ..., transform: withUrl } }
```

### Skipping documents

Return `skip()` from the transform to leave a document out, eg drafts:

```ts
transform: (document, { skip }) =>
  document.draft ? skip("draft") : document,
```

## Errors

A build lists every broken file at once, one problem per line, pointing at the line and column in the file:

```
2 content files have errors:
content/posts/hello.md:2:1: title: Invalid input: expected string, received undefined
content/posts/setup.md:4:5: tags.1: Invalid input: expected string, received number
```

In dev, the same errors are logged and shown in Vite's error overlay, and only those files are left out, so the rest of your site keeps working while you fix them. Two files with the same slug, and a transform that throws, are handled the same way.

tomekit also warns when:

- a collection's `directory` does not exist, or no files in it match `include`, so the collection is empty
- frontmatter uses `content` or `file`, which tomekit sets
- `tomekit/content` or a collection module is imported in the browser bundle, which would ship its documents to the client
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
