import { UnserializableValueError } from "./unserializable-value-error";

class UnserializableInstanceError extends UnserializableValueError {
  override name = "UnserializableInstanceError";

  /** `className` is the instance's constructor name, or `""` when it has none. */
  constructor(className: string, at: string) {
    super(className === "" ? "an object" : `an instance of ${className}`, at);
  }
}

export { UnserializableInstanceError };
