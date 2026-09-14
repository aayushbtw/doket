import { TransformError } from "./transform-error";

class UnserializableValueError extends TransformError {
  override name = "UnserializableValueError";

  /** `what` reads as a noun phrase, eg `a function`; `at` is the key path, or `""` for the root. */
  constructor(what: string, at: string) {
    const where = at === "" ? "" : ` at ${at}`;
    super(
      `cannot write ${what}${where} into content. Return plain data, strings, numbers, Dates, Maps, Sets, URLs or RegExps from transform.`
    );
  }
}

export { UnserializableValueError };
