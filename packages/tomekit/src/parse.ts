import path from "node:path";

import { isMap, isNode, isScalar, isSeq, parseDocument } from "yaml";
import type { Document as YamlDocument } from "yaml";

import type { Issue } from "./errors";
import type { Source, StandardSchema } from "./index";
import { assertContentValue, isPlainObject } from "./value";

const FRONTMATTER = /^---\r?\n(?:(?<data>[\s\S]*?)\r?\n)?---(?:\r?\n|$)/u;

const EXTENSION = /\.[^./]+$/u;

interface ParseInput {
  /** Relative to the collection directory, eg `guides/setup.md`. */
  file: string;
  /** Relative to the project root. */
  filePath: string;
  schema: StandardSchema;
  /** The file's full text, frontmatter included. */
  text: string;
}

/** Where an issue is in the file. Empty when there is no frontmatter to point into. */
interface IssueLocation extends Omit<Issue, "message"> {}

type ParseResult =
  | {
      issues?: undefined;
      /** Where the frontmatter sets `slug`, or `undefined` when the slug is the file path. */
      slugLocation: IssueLocation | undefined;
      source: Source<object>;
    }
  | { issues: Issue[] };

function position(text: string, offset: number) {
  const before = text.slice(0, offset);

  return {
    column: offset - before.lastIndexOf("\n"),
    line: before.split("\n").length,
  };
}

function isKeyedSegment(
  segment: PropertyKey | { readonly key: PropertyKey }
): segment is { readonly key: PropertyKey } {
  return new Object(segment) === segment;
}

function isSlug(value: unknown): value is string {
  return new Object(value) instanceof String && value !== "";
}

/** The offset of the key or item a schema issue points at, as deep as the frontmatter goes. */
function offsetOf(
  yaml: YamlDocument,
  keys: readonly string[]
): number | undefined {
  let node: unknown = yaml.contents;
  let offset = isNode(node) ? node.range?.[0] : undefined;

  for (const key of keys) {
    if (isMap(node)) {
      const pair = node.items.find(
        (item) => String(isScalar(item.key) ? item.key.value : item.key) === key
      );

      if (pair === undefined) {
        break;
      }

      offset = isNode(pair.key) ? pair.key.range?.[0] : offset;
      node = pair.value;
    } else if (isSeq(node)) {
      node = node.items[Number(key)];

      if (!isNode(node)) {
        break;
      }

      offset = node.range?.[0];
    } else {
      break;
    }
  }

  return offset;
}

/** Validates a file's frontmatter and builds its source. Reads nothing from disk. */
async function parse({
  file,
  filePath,
  schema,
  text,
}: ParseInput): Promise<ParseResult> {
  const match = FRONTMATTER.exec(text);
  const frontmatter = match?.groups?.data;

  const yaml =
    frontmatter === undefined
      ? undefined
      : parseDocument(frontmatter, { prettyErrors: false });

  /** Where an offset into the YAML is. With no offset it is the opening `---`. */
  function locationAt(offset: number | undefined): IssueLocation {
    if (match === null) {
      return {};
    }

    if (offset === undefined) {
      return { column: 1, line: 1 };
    }

    const start = match[0].indexOf("\n") + 1;

    return position(text, start + offset);
  }

  function locationOf(keys: readonly string[]): IssueLocation {
    return yaml === undefined ? {} : locationAt(offsetOf(yaml, keys));
  }

  if (yaml !== undefined && yaml.errors.length > 0) {
    return {
      issues: yaml.errors.map((error) => ({
        ...locationAt(error.pos[0]),
        message: error.message,
      })),
    };
  }

  const data: unknown = yaml?.toJS() ?? {};
  assertContentValue(data);
  // Read before the schema, which may strip keys it does not declare.
  const slug = isPlainObject(data) && "slug" in data ? data.slug : undefined;

  const slugIssues =
    slug === undefined || isSlug(slug)
      ? []
      : [
          {
            ...locationOf(["slug"]),
            message:
              'slug: must be a non-empty string, eg "hello-world". Remove it to use the file path instead',
          },
        ];

  const result = await schema["~standard"].validate(data);

  if (result.issues) {
    return {
      issues: [
        ...slugIssues,
        ...result.issues.map((issue) => {
          const keys = (issue.path ?? []).map((segment) =>
            String(isKeyedSegment(segment) ? segment.key : segment)
          );

          const key = keys.join(".");

          return {
            ...locationOf(keys),
            message: key === "" ? issue.message : `${key}: ${issue.message}`,
          };
        }),
      ],
    };
  }

  const { value } = result;

  if (!isPlainObject(value)) {
    return {
      issues: [...slugIssues, { message: "the schema must produce an object" }],
    };
  }

  if (slugIssues.length > 0) {
    return { issues: slugIssues };
  }

  return {
    slugLocation: slug === undefined ? undefined : locationOf(["slug"]),
    source: {
      body: match ? text.slice(match[0].length) : text,
      file: { name: path.basename(file), path: filePath },
      metadata: value,
      slug: isSlug(slug)
        ? slug
        : file.split(path.sep).join("/").replace(EXTENSION, ""),
    },
  };
}

export { type IssueLocation, parse, type ParseResult };
