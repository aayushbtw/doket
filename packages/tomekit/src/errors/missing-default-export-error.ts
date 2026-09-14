import { ConfigError } from "./config-error";

/** The config file has no default export, or it is not a config. */
class MissingDefaultExportError extends ConfigError {
  override name = "MissingDefaultExportError";

  constructor(file: string) {
    super(
      `${file} must export a config as its default export: export default defineConfig({ collections: { ... } })`
    );
  }
}

export { MissingDefaultExportError };
