import { ConfigError } from "./config-error";

class MissingDefaultExportError extends ConfigError {
  override name = "MissingDefaultExportError";

  constructor(file: string) {
    super(
      `${file} must export a config as its default export: export default defineConfig({ collections: { ... } })`
    );
  }
}

export { MissingDefaultExportError };
