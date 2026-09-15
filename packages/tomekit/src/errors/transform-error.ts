import { TomekitError } from "./tomekit-error";

/** A `transform` returned something tomekit cannot serve. Reported as the cause of the entry's `ContentError`. */
class TransformError extends TomekitError {
  override name = "TransformError";
}

export { TransformError };
