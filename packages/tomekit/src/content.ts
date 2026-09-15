import { MissingPluginError } from "./errors";
import type { Source } from "./index";
import type { Collections } from "./query";

/**
 * The name of any collection. The types tomekit generates in `.tomekit`
 * narrow it to the names in your config.
 *
 * @example
 * ```ts
 * const name: CollectionName = "posts";
 * ```
 */
type CollectionName = string;

/**
 * A slug in the named collection, or in any collection. The generated types
 * narrow it to the slugs that exist.
 *
 * @example
 * ```ts
 * const slug: SlugOf<"posts"> = "hello-world";
 * ```
 */
// The conditional only uses `TName`, which the generated types need; here every name gives `string`.
type SlugOf<TName extends CollectionName = CollectionName> =
  TName extends unknown ? string : never;

/**
 * A document in the named collection, or in any collection. The generated
 * types give its `metadata` and `body` the types from your config.
 *
 * @example
 * ```ts
 * function title(post: DocumentOf<"posts">) {
 *   return post.metadata.title;
 * }
 * ```
 */
type DocumentOf<TName extends CollectionName = CollectionName> =
  TName extends unknown ? Source : never;

function missingPlugin(): never {
  throw new MissingPluginError();
}

/**
 * Every collection in your config. Provided by the `tomekit()` Vite plugin;
 * importing it without the plugin throws.
 *
 * @example
 * ```ts
 * import { collections } from "tomekit/content";
 *
 * collections.get("posts").get("hello-world").metadata.title;
 * collections.names(); // ["notes", "posts"]
 * ```
 */
const collections: Collections<Source> = missingPlugin();

export { type CollectionName, collections, type DocumentOf, type SlugOf };
