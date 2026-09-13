# tomekit

Typed content collections for Vite. Parsed at build, nothing at runtime.

Point tomekit at a folder of Markdown files and a schema. At build time it reads every file, validates its frontmatter, runs your transform, and hands the result to your app as plain data. Your server never parses a file, so it works the same on Node, Cloudflare Workers, or anything else without a filesystem.

```ts
import { content } from "tomekit/content";

content.posts.findMany({ orderBy: { publishedAt: "desc" }, take: 5 });
content.posts.findUnique({ slug: "hello-world" });
```

## Why tomekit

- **It is only a Vite plugin.** There is no separate CLI, watcher process, or generated folder. Content reloads with the rest of your dev server.
- **It ships data, not a parser.** Frontmatter is parsed and validated during the build, so a typo fails the build, not a request.
- **It does not render Markdown.** Your transform gets the raw body and you parse it with whatever you already use. That is also why tomekit has one dependency.
- **It works with any validator.** Schemas use [Standard Schema](https://standardschema.dev), so Zod, Valibot and ArkType all work.
- **It has no generated folder.** Types come straight from your config, through one small file that is written once and committed.

## Install

```sh
pnpm add tomekit
```

Requires Node 22.17 or later and Vite 6.4 or later.

## Setup

**1. Define your collections** in `tomekit.config.ts` at the project root:

```ts
import { defineCollection, defineConfig } from "tomekit";
import { z } from "zod";

const posts = defineCollection({
  name: "posts",
  directory: "content/posts",
  include: "**/*.md",
  schema: z.object({
    title: z.string(),
    publishedAt: z.coerce.date(),
  }),
});

export default defineConfig({ collections: [posts] });
```

**2. Add the plugin** to `vite.config.ts`:

```ts
import { tomekit } from "tomekit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tomekit()],
});
```

**3. Query your content** anywhere in your app:

```ts
import { content } from "tomekit/content";

const post = content.posts.findUnique({ slug });
```

That's the whole setup. The first time Vite runs, the plugin writes `tomekit-env.d.ts` next to your config, which is what types `tomekit/content`. Commit it: it only changes if your config file moves. Importing `tomekit/content` without the plugin throws an error that says so.

## Queries

Every collection has the same four methods. They run in memory on data built ahead of time, so they are synchronous.

```ts
content.posts.findMany(); // every post, in file name order

content.posts.findMany({
  where: { draft: false, tags: { has: "vite" } },
  orderBy: { publishedAt: "desc" },
  skip: 10,
  take: 5,
});

content.posts.findFirst({ orderBy: { publishedAt: "desc" } }); // Post | undefined
content.posts.findUnique({ slug: "hello-world" }); // Post | undefined
content.posts.count({ where: { draft: false } }); // number
```

### `where`

A plain value matches by equality, and Dates compare by time. For anything else, use an operator:

| Operator | Applies to | Matches when the field |
| --- | --- | --- |
| `equals`, `not` | any | is, or is not, the value |
| `in`, `notIn` | any | is, or is not, one of the values |
| `has` | arrays | contains the value |
| `contains`, `startsWith`, `endsWith` | strings | contains, starts with, or ends with the text |
| `gt`, `gte`, `lt`, `lte` | numbers, strings, Dates | is greater or less than the value |

Several fields or operators must all match. Wrap a filter in `NOT` to invert it. For anything the operators cannot express, pass a function:

```ts
content.posts.findMany({ where: { NOT: { tags: { has: "draft" } } } });
content.posts.findMany({ where: (post) => post.tags.length > 2 });
```

### `orderBy`

One field, or several in priority order. Missing values sort last either way.

```ts
content.posts.findMany({ orderBy: [{ featured: "desc" }, { title: "asc" }] });
```

## Collection options

| Option | Required |  |
| --- | --- | --- |
| `name` | yes | The key you query the collection by, eg `content.posts` |
| `directory` | yes | Where the files live, relative to the project root |
| `include` | yes | A glob or globs relative to `directory`, eg `"**/*.md"` |
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

`transform` runs once per file at build time and decides what your app receives. Use it to render Markdown, derive fields, or drop what you do not need. The result must be plain data: objects, arrays, strings, numbers, booleans, `null`, `undefined` and `Date`.

```ts
import { marked } from "marked";

const posts = defineCollection({
  name: "posts",
  directory: "content/posts",
  include: "**/*.md",
  schema: z.object({ title: z.string() }),
  transform: ({ content, slug, title }) => ({
    title,
    html: marked.parse(content, { async: false }),
    url: `/posts/${slug}`,
  }),
});
```

The return type of `transform` becomes the type your queries return. `findUnique({ slug })` keeps working even if your transform leaves `slug` out.

### Skipping documents

Return `skip()` from the transform to leave a document out, eg drafts:

```ts
transform: (document, { skip }) =>
  document.draft ? skip("draft") : document,
```

## Errors

A file that fails validation fails the build, and the message names the file and the field:

```
content/posts/hello.md: title: Invalid input: expected string, received undefined
```

In dev, fix the file and tomekit reloads.

## Options

```ts
tomekit({ config: "tomekit.config.ts", dts: "tomekit-env.d.ts" });
```

| Option | Default |  |
| --- | --- | --- |
| `config` | `"tomekit.config.ts"` | Path to the config file, relative to the Vite root |
| `dts` | `"tomekit-env.d.ts"` | Where to write the file that types `tomekit/content`, or `false` to skip it |

If your tsconfig only includes some folders, eg `"include": ["src"]`, set `dts` to a path inside them, eg `"src/tomekit-env.d.ts"`. Otherwise TypeScript never sees the file and `content` is untyped.

tomekit never overwrites the file once you edit it. To register the type yourself, set `dts: false` and add this anywhere TypeScript sees:

```ts
import type config from "./tomekit.config";

declare module "tomekit" {
  interface Register {
    config: typeof config;
  }
}
```

## Not in scope

tomekit stays small on purpose. It does not render MDX, process images, or resolve references between collections. Those belong in your transform or in a tool built for them.

## License

MIT
