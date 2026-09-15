# tomekit

Fully typed content collections for Markdown.

## Support

|            | Version |
| ---------- | ------- |
| Vite       | 8+      |
| TypeScript | 7+      |
| Node       | 22.17+  |

## Philosophy

```
content/
  posts/               ← a collection
    hello-world.md     ← a document
```

- **Collection**: documents that share one schema, eg `posts`, from a folder of files or any loader
- **Document**: one file or loaded entry, parsed and validated, eg `hello-world`

## Quick start

```sh
pnpm add tomekit
```

**1. Define a collection** in `tomekit.config.ts`:

```ts
import { defineConfig, directory } from "tomekit";
import { z } from "zod";

export default defineConfig({
  collections: {
    posts: {
      loader: directory("content/posts"),
      schema: z.object({ title: z.string() }),
    },
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

**3. Add the types path** to `tsconfig.json`, and `.tomekit` to `.gitignore`:

```json
{
  "compilerOptions": {
    "paths": { "tomekit/content*": ["./.tomekit/content*"] }
  }
}
```

**4. Read your content:**

```ts
import { collections } from "tomekit/content";

const post = collections.get("posts").get("hello-world");

post.metadata.title; // string
post.body; // the Markdown
```

## License

MIT
