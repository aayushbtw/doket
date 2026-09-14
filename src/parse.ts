import path from "node:path";

import { isMap, isNode, isScalar, isSeq, parseDocument } from "yaml";
import type { Document as YamlDocument } from "yaml";

import type { BaseDocument, StandardSchema } from "./index";

const FRONTMATTER = /^---\r?\n(?:(?<data>[\s\S]*?)\r?\n)?---(?:\r?\n|$)/u;
const EXTENSION = /\.[^./]+$/u;
const RESERVED = ["content", "file"] as const;

/** A problem at a place in a file. `line` and `column` start at 1. */
interface Issue {
  column?: number;
  line?: number;
  message: string;
}

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

function position(
  source: string,
  offset: number
): { column: number; line: number } {
  const before = source.slice(0, offset);
  return {
    column: offset - before.lastIndexOf("\n"),
    line: before.split("\n").length,
  };
}

/** The offset of the key or item a schema issue points at, as deep as the frontmatter goes. */
function offsetOf(
  yaml: YamlDocument,
  keys: readonly PropertyKey[]
): number | undefined {
  let node: unknown = yaml.contents;
  let offset = isNode(node) ? node.range?.[0] : undefined;
  for (const key of keys) {
    if (isMap(node)) {
      const pair = node.items.find(
        (item) =>
          String(isScalar(item.key) ? item.key.value : item.key) === String(key)
      );
      if (pair === undefined) {
        break;
      }
      offset = isNode(pair.key) ? pair.key.range?.[0] : offset;
      node = pair.value;
    } else if (isSeq(node) && typeof key !== "symbol") {
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

  // A frontmatter block with no keys to point at points at its opening `---`.
  function at(offset: number | undefined): Omit<Issue, "message"> {
    if (match === null) {
      return {};
    }
    const start = match[0].indexOf("\n") + 1;
    return offset === undefined
      ? { column: 1, line: 1 }
      : position(source, start + offset);
  }

  if (yaml !== undefined && yaml.errors.length > 0) {
    return {
      issues: yaml.errors.map((error) => ({
        ...at(error.pos[0]),
        message: error.message,
      })),
    };
  }

  const data: unknown = yaml?.toJS() ?? {};
  const result = await schema["~standard"].validate(data);
  if (result.issues) {
    return {
      issues: result.issues.map((issue) => {
        const keys = (issue.path ?? []).map((part) =>
          typeof part === "object" ? part.key : part
        );
        const key = keys.map(String).join(".");
        return {
          ...(yaml === undefined ? {} : at(offsetOf(yaml, keys))),
          message: key === "" ? issue.message : `${key}: ${issue.message}`,
        };
      }),
    };
  }

  const { value } = result;
  if (typeof value !== "object" || value === null) {
    return { issues: [{ message: "the schema must produce an object" }] };
  }

  const warnings = RESERVED.filter((key) => key in value).map((key) => ({
    ...(yaml === undefined ? {} : at(offsetOf(yaml, [key]))),
    message: `frontmatter "${key}" is ignored, since tomekit sets \`${key}\``,
  }));

  const slug = "slug" in value ? value.slug : undefined;
  return {
    document: {
      ...value,
      content: match ? source.slice(match[0].length) : source,
      file: { name: path.basename(file), path: filePath },
      slug:
        typeof slug === "string" && slug !== ""
          ? slug
          : file.split(path.sep).join("/").replace(EXTENSION, ""),
    },
    warnings,
  };
}

export { type Issue, parse, type ParseResult };
