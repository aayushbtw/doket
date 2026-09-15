---
title: Installation
description: Add tomekit to a Vite project.
section: Getting started
order: 3
---

## Install

```sh
pnpm add tomekit
```

## Add the plugin

```ts
import { tomekit } from "tomekit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tomekit()],
});
```

## Add the types path

Add the path to `tsconfig.json`, and `.tomekit` to `.gitignore`:

```json
{
  "compilerOptions": {
    "paths": { "tomekit/content*": ["./.tomekit/content*"] }
  }
}
```
