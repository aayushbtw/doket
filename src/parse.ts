import path from "node:path";

import { isMap, isNode, isScalar, isSeq, parseDocument } from "yaml";
import type { Document as YamlDocument } from "yaml";

import type { Issue } from "./errors";
import type { BaseDocument, StandardSchema } from "./index";
import { assertContentValue, isPlainObject } from "./value";

const FRONTMATTER = /^---\r?\n(?:(?<data>[\s\S]*?)\r?\n)?---(?:\r?\n|$)/u;

const EXTENSION = /\.[^./]+$/u;

const RESERVED = ["content", "file"] as const;

interface ParseInput {
  /** Relative to the collection directory, eg `guides/setup.md`. */
  file: string;
  /** Relative to the project root. */
  filePath: string;
  schema: StandardSchema;
  source: string;
}

type ParseResult =
  | { document: BaseDocument; issues?: undefined; warnings: Issue[] }
  | { issues: Issue[] };

function position(source: string, offset: number) {
  const before = source.slice(0, offset);

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

/** Validates a file's frontmatter and builds its document. Reads nothing from disk. */
async function parse({
  file,
  filePath,
  schema,
  source,
}: ParseInput): Promise<ParseResult> {
  const match = FRONTMATTER.exec(source);
  const frontmatter = match?.groups?.data;

  const yaml =
    frontmatter === undefined
      ? undefined
      : parseDocument(frontmatter, { prettyErrors: false });

  /** An issue at an offset into the YAML. With no keys to point at, it points at the opening `---`. */
  function issueAtOffset(message: string, offset: number | undefined): Issue {
    if (match === null) {
      return { message };
    }

    if (offset === undefined) {
      return { column: 1, line: 1, message };
    }

    const start = match[0].indexOf("\n") + 1;

    return { ...position(source, start + offset), message };
  }

  function issueAtKeys(message: string, keys: readonly string[]): Issue {
    return yaml === undefined
      ? { message }
      : issueAtOffset(message, offsetOf(yaml, keys));
  }

  if (yaml !== undefined && yaml.errors.length > 0) {
    return {
      issues: yaml.errors.map((error) =>
        issueAtOffset(error.message, error.pos[0])
      ),
    };
  }

  const data: unknown = yaml?.toJS() ?? {};
  assertContentValue(data);
  const result = await schema["~standard"].validate(data);

  if (result.issues) {
    return {
      issues: result.issues.map((issue) => {
        const keys = (issue.path ?? []).map((segment) =>
          String(isKeyedSegment(segment) ? segment.key : segment)
        );

        const key = keys.join(".");

        return issueAtKeys(
          key === "" ? issue.message : `${key}: ${issue.message}`,
          keys
        );
      }),
    };
  }

  const { value } = result;

  if (!isPlainObject(value)) {
    return { issues: [{ message: "the schema must produce an object" }] };
  }

  const warnings = RESERVED.flatMap((key) =>
    key in value
      ? [
          issueAtKeys(
            `frontmatter "${key}" is ignored, since tomekit sets \`${key}\``,
            [key]
          ),
        ]
      : []
  );

  const slug = "slug" in value ? value.slug : undefined;

  return {
    document: {
      ...value,
      content: match ? source.slice(match[0].length) : source,
      file: { name: path.basename(file), path: filePath },
      slug: isSlug(slug)
        ? slug
        : file.split(path.sep).join("/").replace(EXTENSION, ""),
    },
    warnings,
  };
}

export { parse, type ParseResult };
