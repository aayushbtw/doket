import { TomekitError } from "./tomekit-error";

/** A problem at a place in a file. `line` and `column` start at 1. */
interface Issue {
  column?: number;
  line?: number;
  message: string;
}

/** A problem with one content file, printed as `file:line:column: message`. */
class ContentError extends TomekitError {
  override name = "ContentError";
  readonly column: number | undefined;
  /** Relative to the project root. */
  readonly file: string;
  readonly line: number | undefined;

  constructor(file: string, issue: Issue, options?: ErrorOptions) {
    const location = [file, issue.line, issue.column]
      .filter((part) => part !== undefined)
      .join(":");

    super(`${location}: ${issue.message}`, options);
    this.column = issue.column;
    this.file = file;
    this.line = issue.line;
  }
}

export { ContentError, type Issue };
