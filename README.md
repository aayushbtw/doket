# tomekit

Typed content collections for Vite. Parsed at build, nothing at runtime.

Point tomekit at a folder of Markdown files and a schema. At build time it reads every file, validates its frontmatter, runs your transform, and hands the result to your app as plain data. Your server never parses a file, so it works the same on Node, Cloudflare Workers, or anything else without a filesystem.

```ts
import { content } from "tomekit/content";

content.posts.findMany({ orderBy: { publishedAt: "desc" }, take: 5 });
content.posts.findUnique({ where: { slug: "hello-world" } });
```

## Why tomekit

- **It is only a Vite plugin.** There is no separate CLI, watcher process, or generated folder. Content reloads with the rest of your dev server.
- **It ships data, not a parser.** Frontmatter is parsed and validated during the build, so a typo fails the build, not a request.
- **It does not render Markdown.** Your transform gets the raw body and you parse it with whatever you already use. That is also why tomekit has one dependency.
- **It works with any validator.** Schemas use [Standard Schema](https://standardschema.dev), so Zod, Valibot and ArkType all work.
- **Your content stays out of generated files.** Only types are generated, into a gitignored folder. Documents are served by the plugin, so a post edit never rewrites anything on disk.

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
    "paths": { "tomekit/content": ["./.tomekit/content"] }
  }
}
```

```
.tomekit
```

**4. Query your content** anywhere in your app:

```ts
import { content } from "tomekit/content";

const post = content.posts.findUnique({ where: { slug } });
```

Whenever content loads, the plugin writes types for every collection into `.tomekit/content`: what each document looks like and which slugs exist. They are rewritten only when a collection or a slug changes. Importing `tomekit/content` without the plugin throws an error that says so.

## Types

Each collection gets a document type and a slug type, named after its key in PascalCase:

```ts
import { content, type Posts, type PostsSlug } from "tomekit/content";

function title(post: Posts) {
  return post.title;
}

content.posts.findUnique({ where: { slug: "hello-world" } }); // suggests PostsSlug values, accepts any string
```

The types only update while Vite is running, so after a fresh clone, run `vite dev` or `vite build` once before `tsc`.

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
content.posts.findUnique({ where: { slug: "hello-world" } }); // Post | undefined
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

### `select`

Return only some fields, eg for a list page that does not need each post's body:

```ts
content.posts.findMany({ select: { slug: true, title: true } }); // { slug: string; title: string }[]
```

### `orderBy`

One field, or several in priority order. Missing values sort last either way.

```ts
content.posts.findMany({ orderBy: [{ featured: "desc" }, { title: "asc" }] });
```

## Collection options

Each key in `collections` is the name you query it by, eg `posts` for `content.posts`. Write each one inline, or wrap it in `defineCollection` to define it in its own file. Either way `transform` knows your schema's types.

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

`transform` runs once per file at build time and decides what your app receives. Use it to render Markdown, derive fields, or drop what you do not need. The result must be plain data: objects, arrays, strings, numbers, booleans, `null`, `undefined` and `Date`.

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

The return type of `transform` becomes the type your queries return. `findUnique({ where: { slug } })` keeps working even if your transform leaves `slug` out.

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

In dev, the same error is logged and only that file is left out, so the rest of your site keeps working while you fix it. Two files with the same slug are handled the same way.

tomekit also warns when:

- a collection's `directory` does not exist, or no files in it match `include`
- frontmatter uses `content` or `file`, which tomekit sets
- `tomekit/content` is imported in the browser bundle, which would ship every document to the client

While the dev server runs, saving a file only re-runs that file's transform, and files that do not match a collection's `include` never trigger a reload.

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
