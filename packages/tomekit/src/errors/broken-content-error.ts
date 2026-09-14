import type { ContentError } from "./content-error";
import { TomekitError } from "./tomekit-error";

/** Every broken file in a build, one per line. */
class BrokenContentError extends TomekitError {
  override name = "BrokenContentError";
  /** One per problem, so a file with two problems appears twice. */
  readonly errors: readonly ContentError[];

  constructor(errors: readonly ContentError[]) {
    const files = new Set(errors.map((error) => error.file)).size;
    const heading = `${files} content ${files === 1 ? "file has" : "files have"} errors:`;
    super([heading, ...errors.map((error) => error.message)].join("\n"));
    this.errors = errors;
  }
}

export { BrokenContentError };
