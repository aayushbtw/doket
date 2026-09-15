import { TomekitError } from "./tomekit-error";

/** A problem at a place in a file. `line` and `column` start at 1. */
interface Issue {
  column?: number;
  line?: number;
  message: string;
}

/** What a content problem is about: a file, or a collection and its entry when a loader gave no file. */
interface ContentSubject {
  collection?: string;
  /** Relative to the project root. */
  file?: string;
  slug?: string;
}

function label({ collection = "", file, slug }: ContentSubject): string {
  if (file !== undefined) {
    return file;
  }

  const name = `collections.get(${JSON.stringify(collection)})`;

  return slug === undefined ? name : `${name}.get(${JSON.stringify(slug)})`;
}

/**
 * A problem with one entry, printed as `file:line:column: message`, or as
 * `collections.get("name").get("slug"): message` for an entry without a file.
 */
class ContentError extends TomekitError {
  override name = "ContentError";
  readonly collection: string | undefined;
  readonly column: number | undefined;
  /** Relative to the project root, or `undefined` when the entry has no file. */
  readonly file: string | undefined;
  readonly line: number | undefined;
  readonly slug: string | undefined;

  constructor(subject: ContentSubject, issue: Issue, options?: ErrorOptions) {
    const location = [label(subject), issue.line, issue.column]
      .filter((part) => part !== undefined)
      .join(":");

    super(`${location}: ${issue.message}`, options);
    this.collection = subject.collection;
    this.column = issue.column;
    this.file = subject.file;
    this.line = issue.line;
    this.slug = subject.slug;
  }
}

export { ContentError, type ContentSubject, type Issue, label };
