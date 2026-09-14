import { TransformError } from "./transform-error";

/** A `transform` returned a field other than `metadata` or `body`. */
class UnknownTransformFieldError extends TransformError {
  override name = "UnknownTransformFieldError";

  constructor(field: string) {
    super(
      `transform returned ${JSON.stringify(field)}, but it can only return \`metadata\` and \`body\`. Put derived values inside \`metadata\` instead.`
    );
  }
}

export { UnknownTransformFieldError };
