---
title: Errors
description: How problems in content and config are reported.
section: Guides
order: 4
---

tomekit reports every broken file in one pass, pointing at where to fix it.

## Content errors

A problem in a document is printed as `file:line:column: message`, with the file relative to the project root.

```
content/posts/hello.md:2:1: title: Invalid input: expected string, received undefined
content/posts/typo.md:2:1: author: no document in collection "authors" has the slug "adaa". Fix the slug, or add a document with it to "authors"
```

An entry from a loader without a file is named by its collection and slug instead: `collections.get("pages").get("about"): message`.

- `vite build` fails, listing every broken file.
- The dev server logs the errors, shows them in the error overlay at the first one's location, and keeps serving everything else. Broken documents are left out until you fix them.

Content errors come from:

- the frontmatter, eg YAML that doesn't parse, or a `slug` that isn't a non-empty string
- the schema
- two documents with the same slug
- `transform`, eg a function in what it returns
- a loader that throws, or reports `issues`
- a [reference](/docs/collections#references) to a slug that no document has

## Warnings

Warnings don't stop anything. Each one says what happens because of it:

```
posts: directory "content/post" does not exist, so collections.get("posts") is empty
```

## Config errors

A config that can't be used fails `vite build`. The dev server logs it and keeps running, but `tomekit/content` fails to load until you fix the config:

- `ConfigLoadError`: importing `tomekit.config.ts` threw, eg on a syntax error
- `MissingDefaultExportError`: the file doesn't `export default defineConfig(...)`
- `InvalidConfigError`: the config breaks a rule, eg a collection name that isn't a valid identifier, or a collection without a `loader`

## Catching errors

Every error is a class exported from `tomekit`, so check it with `instanceof`:

| Class | Extends | Thrown when |
| --- | --- | --- |
| `TomekitError` | `Error` | The base of every error |
| `BrokenContentError` | `TomekitError` | A build has content errors. `errors` holds each `ContentError` |
| `ContentError` | `TomekitError` | One problem in a document. It has `file`, `line`, `column`, `collection` and `slug` |
| `ConfigError` | `TomekitError` | The base of config errors |
| `TransformError` | `TomekitError` | The base of errors from `transform`, set as a `ContentError`'s `cause` |
| `PluginError` | `TomekitError` | The base of errors from the Vite plugin |
| `MissingPluginError` | `PluginError` | `tomekit/content` is imported without the `tomekit()` plugin |

Vite wraps errors thrown by plugins and keeps the originals under `errors`:

```ts
import { build } from "vite";
import { BrokenContentError } from "tomekit";

const failure = await build().catch((cause: unknown) => cause);
const errors =
  failure instanceof Error && "errors" in failure ? failure.errors : [];

const broken = Array.isArray(errors)
  ? errors.find((error) => error instanceof BrokenContentError)
  : undefined;

broken?.errors[0]?.file; // "content/posts/hello.md"
```
