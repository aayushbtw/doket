import { PluginError } from "./plugin-error";

/** A plugin hook ran before Vite resolved its config. */
class PluginNotReadyError extends PluginError {
  override name = "PluginNotReadyError";

  constructor() {
    super("the plugin was used before Vite resolved its config");
  }
}

export { PluginNotReadyError };
