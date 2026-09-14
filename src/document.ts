import { TransformResultError, UnknownTransformFieldError } from "./errors";
import type { Source, TransformResult } from "./index";
import { assertContentValue, isPlainObject } from "./value";
import type { ContentValue } from "./value";

const RESULT_FIELDS = new Set(["body", "metadata"]);

/** Checks what `transform` returned: an object with only `metadata` and/or `body`. */
function assertTransformResult(
  result: unknown
): asserts result is TransformResult {
  if (!isPlainObject(result)) {
    throw new TransformResultError();
  }

  const unknownField = Object.keys(result).find(
    (field) => !RESULT_FIELDS.has(field)
  );

  if (unknownField !== undefined) {
    throw new UnknownTransformFieldError(unknownField);
  }
}

/**
 * The document a source becomes once `transform` returned `result`: its
 * `metadata` and `body` replace the source's, and the rest stays.
 */
function buildDocument(
  source: Source<object>,
  result: TransformResult
): ContentValue {
  const document = {
    body: "body" in result ? result.body : source.body,
    file: source.file,
    metadata: "metadata" in result ? result.metadata : source.metadata,
    slug: source.slug,
  };

  assertContentValue(document);

  return document;
}

export { assertTransformResult, buildDocument };
