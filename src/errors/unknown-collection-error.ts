import { PluginError } from "./plugin-error";

class UnknownCollectionError extends PluginError {
  override name = "UnknownCollectionError";

  constructor(moduleId: string, known: readonly string[]) {
    const names = known.map((name) => JSON.stringify(name)).join(", ");
    super(
      `${moduleId} does not exist. Collections in the config: ${names || "none"}.`
    );
  }
}

export { UnknownCollectionError };
