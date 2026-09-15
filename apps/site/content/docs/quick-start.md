---
title: Quick start
description: Define a collection and read it, typed.
section: Getting started
order: 2
---

## Define a collection

```ts
import { defineConfig } from "tomekit";
import { z } from "zod";

export default defineConfig({
  collections: {
    posts: {
      directory: "content/posts",
      schema: z.object({ title: z.string() }),
    },
  },
});
```

## Read your content

```ts
import { collections } from "tomekit/content";

const post = collections.get("posts").get("hello-world");

post.metadata.title; // string
post.body; // the Markdown
```
