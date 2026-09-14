import { ConfigError } from "./config-error";

/** Importing the config threw, eg on a syntax error. The original error is the `cause`. */
class ConfigLoadError extends ConfigError {
  override name = "ConfigLoadError";

  /** `file` is relative to the root; `cause` is what importing it threw. */
  constructor(file: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`${file} failed to load: ${message}`, { cause });
  }
}

export { ConfigLoadError };
