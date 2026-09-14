import { TomekitError } from "./tomekit-error";

/** `tomekit/content` was used in a way the Vite plugin cannot serve. */
class PluginError extends TomekitError {
  override name = "PluginError";
}

export { PluginError };
