import type { Issue } from "./errors";
import type { Entry, Source, StandardSchema } from "./index";
import type { Locate } from "./parse";
import { isPlainObject } from "./value";
import type { ContentValue } from "./value";

type ValidateResult =
  | { issues?: undefined; source: Source<object> }
  | { issues: Issue[] };

function isKeyedSegment(
  segment: PropertyKey | { readonly key: PropertyKey }
): segment is { readonly key: PropertyKey } {
  return new Object(segment) === segment;
}

/** Runs the schema on an entry's metadata and builds its source. Issues point at `locate`, when the entry has one. */
async function validate(
  entry: Entry,
  metadata: ContentValue,
  schema: StandardSchema,
  locate?: Locate
): Promise<ValidateResult> {
  const result = await schema["~standard"].validate(metadata);

  if (result.issues) {
    return {
      issues: result.issues.map((issue) => {
        const keys = (issue.path ?? []).map((segment) =>
          String(isKeyedSegment(segment) ? segment.key : segment)
        );

        const key = keys.join(".");

        return {
          ...locate?.(keys),
          message: key === "" ? issue.message : `${key}: ${issue.message}`,
        };
      }),
    };
  }

  const { value } = result;

  if (!isPlainObject(value)) {
    return { issues: [{ message: "the schema must produce an object" }] };
  }

  return {
    source: {
      body: entry.body ?? "",
      file: entry.file,
      metadata: value,
      slug: entry.slug,
    },
  };
}

export { validate, type ValidateResult };
