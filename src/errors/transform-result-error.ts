import { TransformError } from "./transform-error";

/** A `transform` returned something other than an object or `skip()`. */
class TransformResultError extends TransformError {
  override name = "TransformResultError";

  constructor() {
    super(
      "transform must return an object with `metadata` and/or `body`, or `skip()`. Return `{}` to keep the document as it is."
    );
  }
}

export { TransformResultError };
