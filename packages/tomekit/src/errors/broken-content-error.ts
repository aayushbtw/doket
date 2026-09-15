import { label } from "./content-error";
import type { ContentError } from "./content-error";
import { TomekitError } from "./tomekit-error";

/** Every broken entry in a build, one per line. */
class BrokenContentError extends TomekitError {
  override name = "BrokenContentError";
  /** One per problem, so an entry with two problems appears twice. */
  readonly errors: readonly ContentError[];

  constructor(errors: readonly ContentError[]) {
    const count = new Set(errors.map((error) => label(error))).size;

    const noun = errors.every((error) => error.file !== undefined)
      ? ["content file has", "content files have"]
      : ["entry has", "entries have"];

    const heading = `${count} ${count === 1 ? noun[0] : noun[1]} errors:`;
    super([heading, ...errors.map((error) => error.message)].join("\n"));
    this.errors = errors;
  }
}

export { BrokenContentError };
