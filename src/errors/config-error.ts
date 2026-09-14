import { TomekitError } from "./tomekit-error";

/** `tomekit.config.ts` could not be used. */
class ConfigError extends TomekitError {
  override name = "ConfigError";
}

export { ConfigError };
