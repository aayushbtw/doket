import { MissingPluginError } from "./errors";
import type { Content } from "./index";

function missingPlugin(): never {
  throw new MissingPluginError();
}

/**
 * Every collection in your config, keyed by name. Provided by the `tomekit()`
 * Vite plugin; importing it without the plugin throws.
 *
 * @example
 * ```ts
 * import { content } from "tomekit/content";
 *
 * content.posts.get("hello-world");
 * ```
 */
const content: Content = missingPlugin();

export { content };
