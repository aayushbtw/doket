import { MissingPluginError } from "./errors";
import type { Source } from "./index";
import type { Collections } from "./query";

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

export { collections };
