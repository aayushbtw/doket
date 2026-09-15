---
title: Overview
description: Fully typed content collections for Markdown.
section: Getting started
order: 1
---

tomekit parses and validates your Markdown at build time, so nothing is parsed at runtime.

## Collections and documents

```
content/
  posts/               ← a collection
    hello-world.md     ← a document
```

- **Collection**: a folder of files that share one schema, eg `posts`
- **Document**: one file, parsed and validated, eg `hello-world`

## Support

|            | Version |
| ---------- | ------- |
| Vite       | 8+      |
| TypeScript | 7+      |
| Node       | 22.17+  |
