# doket

Typed content collections for Vite. Parsed at build, nothing at runtime.

Point doket at a folder of Markdown files and a schema. At build time it reads every file, validates its frontmatter, runs your transform, and hands the result to your app as plain data. Your server never parses a file, so it works the same on Node, Cloudflare Workers, or anything else without a filesystem.

```ts
import { collections } from "virtual:doket";

collections.posts.all(); // every post, typed from your schema
collections.posts.get("hello-world"); // one post, or undefined
```

## Why doket

- **It is only a Vite plugin.** There is no separate CLI, watcher process, or generated folder. Content reloads with the rest of your dev server.
- **It ships data, not a parser.** Frontmatter is parsed and validated during the build, so a typo fails the build, not a request.
- **It does not render Markdown.** Your transform gets the raw body and you parse it with whatever you already use. That is also why doket has one dependency.
- **It works with any validator.** Schemas use [Standard Schema](https://standardschema.dev), so Zod, Valibot and ArkType all work.
- **It has no codegen.** Types come straight from your config.

## Install

```sh
pnpm add doket
```

Requires Node 22 or later and Vite 6.1 or later.

## Setup

**1. Define your collections** in `doket.config.ts` at the project root:

```ts
import { defineCollection, defineConfig } from "doket";
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
import { doket } from "doket/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [doket()],
});
```

**3. Type the virtual module.** Add a path alias for the config to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": { "doket.config": ["./doket.config.ts"] }
  }
}
```

Then declare the module in any `.d.ts` file, eg `src/doket.d.ts`:

```ts
declare module "virtual:doket" {
  import type config from "doket.config";
  import type { Collections } from "doket";

  export const collections: Collections<typeof config>;
}
```

## Documents

Without a transform, each document is your validated frontmatter plus two fields:

| Field | Value |
| --- | --- |
| `content` | The file's body, after the frontmatter block |
| `_meta.slug` | The path inside the collection directory, without the extension, eg `guides/setup` |
| `_meta.fileName` | The file name with its extension, eg `setup.md` |
| `_meta.filePath` | The path relative to the project root |

A file without frontmatter is validated as an empty object.

## Transform

`transform` runs once per file at build time and decides what your app receives. Use it to render Markdown, derive fields, or drop what you do not need. The result must be plain data: objects, arrays, strings, numbers, booleans, `null`, `undefined` and `Date`.

```ts
import { marked } from "marked";

const posts = defineCollection({
  name: "posts",
  directory: "content/posts",
  include: "**/*.md",
  schema: z.object({ title: z.string() }),
  transform: ({ _meta, content, title }) => ({
    title,
    html: marked.parse(content, { async: false }),
    url: `/posts/${_meta.slug}`,
  }),
});
```

The return type of `transform` becomes the type of `collections.posts.all()`.

## Errors

A file that fails validation fails the build, and the message names the file and the field:

```
content/posts/hello.md: title: Invalid input: expected string, received undefined
```

In dev, fix the file and doket reloads.

## Options

```ts
doket({ config: "doket.config.ts" });
```

| Option | Default | |
| --- | --- | --- |
| `config` | `"doket.config.ts"` | Path to the config file, relative to the Vite root |

## Not in scope

doket stays small on purpose. It does not render MDX, process images, or resolve references between collections. Those belong in your transform or in a tool built for them.
