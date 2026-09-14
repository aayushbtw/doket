# tomekit

Typed content collections for Vite. Content is parsed and validated at build time and served as generated modules, so nothing is parsed at runtime.

Goal: the best API and DX, fully typed, fast. The one real consumer is `../portfolio` (it depends on `file:../tomekit`).

## Commands

```sh
pnpm check   # format + lint + typecheck (vp check); `pnpm fix` autofixes
pnpm test    # vitest
pnpm build   # vp pack → dist
```

Before calling a change done, run `pnpm check` and `pnpm test`. For changes to runtime output or generated types, also check the portfolio: `pnpm build`, then in `../portfolio` run `pnpm install && pnpm exec vite build && pnpm exec tsc --noEmit`. Its uncommitted files belong to the user, so never revert them.

## Structure

Pure modules, one class that owns state, and a thin adapter, each in its own files.

| Layer | Files | Rule |
| --- | --- | --- |
| Public types + config | `index.ts` | Types and `define*` helpers only. No IO |
| Runtime | `query.ts`, `content.ts` | Ships to users' servers. Keep it tiny |
| Pure core | `errors/` (one class per file), `value.ts` (`ContentValue` and its checks), `config.ts` (config checks), `parse.ts`, `serialize.ts`, `generate.ts` (source strings) | No disk, no Vite, no state. Input in, result out |
| IO per collection | `collection.ts` | Reads files, runs transforms, returns `{ entries, errors, warnings }` |
| State | `loader.ts` (`ContentLoader`) | Owns config, caches and the in-flight build. Knows nothing about how errors are shown |
| Adapter | `vite.ts` | Maps Vite hooks to loader calls and reports results. No content logic |

- New logic goes into the lowest layer that can hold it. If a function needs neither the disk nor state, put it in a pure module.
- Name each file after its one concern (`parse.ts`, `serialize.ts`). Split a file when it takes on a second concern, not when it gets long.
- State lives in a class with `#private` fields and `readonly` where possible, not in `let`s inside a closure.
- Keep one explicit `export { ... }` list at the bottom of each file. No `export *` barrels, since the public surface is only what `package.json` `exports` lists.
- One test file per source module in `test/` (`collection.ts` → `collection.test.ts`). `parse.ts` and `loader.ts` are currently covered through `collection.test.ts` and `vite.test.ts`, so give them their own files when they grow. Type-level tests go in `test/types.ts`, which is checked by `pnpm check` and never run.

## Errors

- **Return problems, don't throw them.** Lower layers return results (`{ document } | { issues }`, `{ entries, errors }`). The throw-or-report decision is made once, in the adapter: `vite build` throws, dev logs the errors, shows them in the overlay and serves the files that work.
- **Collect, don't stop.** Report every broken file in one pass.
- **Point at the source.** A content problem is a `ContentError` printed as `file:line:column: message`, with `file` relative to the root. When a key is missing, point at the deepest parent that exists. With no frontmatter at all, leave line and column out.
- **Messages name the fix.** Say what went wrong, then what to do: ``transform changed slug "a" to "b". Set `slug` in the frontmatter instead``.
- **Warnings state the consequence**: `directory "x" does not exist, so content.posts is empty`.
- Only the adapter adds the `[tomekit]` prefix and talks to the logger. Lower layers return plain strings.
- **Every thrown error is a class in `src/errors/`**, one per file, exported from `src/errors/index.ts`. No `throw new Error(...)` in `src/`. Classes extend a category (`ConfigError`, `ContentError`, `TransformError`, `PluginError`), which extends `TomekitError`. Each sets `name` explicitly, and its constructor takes data and builds the message, so the wording lives with the class. Add a class per distinct failure, not per call site.
- An error that wraps another passes it as `cause`.

## TSDoc

Public exports get TSDoc: a one-sentence summary, then an `@example` that runs as written. Results go in trailing comments.

````ts
/**
 * The document with this slug, or `undefined` if there is none.
 *
 * @example
 * ```ts
 * content.posts.get("hello-world")?.title // "Hello world"
 * ```
 */
````

- Document everything users import from `tomekit`, `tomekit/content` and `tomekit/vite`, plus each option field.
- Add `@param` / `@returns` only when they say something the name and type don't (units, what `undefined` means, ownership).
- Internal functions get no TSDoc unless they have a contract the types can't express. Never add docs to a function just because its neighbors have them.
- Inline comments explain only the non-obvious _why_, never restate the line.

## Code style

Lint is oxlint with anti-slop (vendored in `tools/oxlint/anti-slop/`) and a short explicit rule list in `vite.config.ts`, no preset. Anti-slop always wins:

- Never turn off, loosen or suppress an anti-slop rule to make code pass. Change the code.
- When another rule conflicts with writing code the anti-slop way, turn that rule off in `vite.config.ts` with a one-line reason. Don't write code that dodges both.
- Add a rule to the list when it would have caught a real problem, not because a preset has it.
- Unknown input is checked once at its boundary with an assertion or type predicate (eg `assertContentValue`), then handled as a named type. No `typeof`; tell primitives apart by boxing them (`new Object(value) instanceof Number`).
- A parameter typed `unknown` is only allowed when it is named `cause` or is a type predicate's subject.

The linter enforces most of these, so match them up front instead of relying on `pnpm fix`:

- Use `interface` for object shapes, including reshaped ones (`interface A extends Omit<B, "k"> {}`). Use `type` only for unions, function types and mapped or conditional types.
- Types inferred from user schemas are wrapped once in `Prettify` (`{ [K in keyof T]: T[K] } & {}`), so errors print the flat fields instead of nested helper names. Use `PrettifyIfPlainObject` where a value might be an array or a built-in (Date, Map, Set, RegExp), which must keep their own type. Don't generate named interfaces to work around this.
- Helper types that exist only for generated code or the type system get `@internal` in their TSDoc.
- Use function declarations, not arrow consts (`func-style`). Arrows are fine as inline callbacks.
- Use `async`/`await` with `try`/`catch`, not `.then`/`.catch` chains.
- Object keys sorted, no chained assignment, no `any` or unsafe assertions (in tests too).
- Put options objects with defaults in the signature: `function tomekit({ config = "tomekit.config.ts" }: TomekitOptions = {})`.
- Name the value a function returns (`serialize`, `accessor`, `summary`) or the action it takes (`loadCollection`, `writeTypes`).

## Decisions already made (do not reopen)

- No Effect or other FP framework: a large dependency for a one-dependency library. Use the layering above instead.
- Generated files stay in `.tomekit/`, never in `src/` or the root. `Register`-style module augmentation was rejected.
- No type-level "is serializable" check on transform output: it fails on recursive AST types. Validate at runtime in `serialize.ts` and report the key path.
- Aggregate types go in `.tomekit/content.d.ts`, not `content/index.d.ts`, so a collection can be named `index`.
- Minimum Vite is 8. Backwards compatibility is not a goal yet, so prefer current APIs over deprecated ones.
- No singletons or `getInstance`: each plugin instance gets its own loader.
