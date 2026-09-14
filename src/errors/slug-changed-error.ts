import type { ContentValue } from "../value";
import { TransformError } from "./transform-error";

class SlugChangedError extends TransformError {
  override name = "SlugChangedError";

  constructor(slug: string, changedTo: ContentValue) {
    super(
      `transform changed slug "${slug}" to ${JSON.stringify(changedTo)}. Set \`slug\` in the frontmatter instead, so lookups and types agree.`
    );
  }
}

export { SlugChangedError };
