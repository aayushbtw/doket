const REASON = Symbol("reason");

/**
 * Returned from `transform` to leave an entry out of its collection. Create
 * one with `skip()` from the transform's second argument.
 */
// Only a symbol key, so no plain object matches it by shape, and the editor
// suggests nothing from it inside the object a transform returns.
class Skipped {
  readonly [REASON]: string | undefined;

  constructor(reason?: string) {
    this[REASON] = reason;
  }
}

export { REASON, Skipped };
