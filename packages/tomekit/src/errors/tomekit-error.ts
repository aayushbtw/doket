/**
 * The base of every error tomekit throws.
 *
 * @example
 * ```ts
 * import { build } from "vite";
 * import { BrokenContentError } from "tomekit";
 *
 * // Vite wraps errors thrown by plugins and keeps them under `errors`.
 * const failure = await build().catch((cause: unknown) => cause);
 * const errors = failure instanceof Error && "errors" in failure ? failure.errors : [];
 * const broken = Array.isArray(errors) ? errors.find((error) => error instanceof BrokenContentError) : undefined;
 * broken?.errors[0]?.file // "content/posts/hello.md"
 * ```
 */
class TomekitError extends Error {
  override name = "TomekitError";
}

export { TomekitError };
