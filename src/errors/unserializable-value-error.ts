import { TransformError } from "./transform-error";

/** Content holds a value that cannot be written into a module, eg a function or a cycle. */
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
