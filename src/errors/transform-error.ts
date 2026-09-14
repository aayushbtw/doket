import { TomekitError } from "./tomekit-error";

/** A `transform` returned something tomekit cannot serve. Reported as the cause of the file's `ContentError`. */
class TransformError extends TomekitError {
  override name = "TransformError";
}

export { TransformError };
