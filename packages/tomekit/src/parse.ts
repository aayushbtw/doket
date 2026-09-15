import path from "node:path";

import { isMap, isNode, isScalar, isSeq, parseDocument } from "yaml";
import type { Document as YamlDocument } from "yaml";

import type { Issue } from "./errors";
import type { Entry, FileInfo } from "./index";
import { assertContentValue, isPlainObject } from "./value";

const FRONTMATTER = /^---\r?\n(?:(?<data>[\s\S]*?)\r?\n)?---(?:\r?\n|$)/u;

const EXTENSION = /\.[^./]+$/u;

/** Where a key is written in a file. `line` and `column` start at 1. */
interface Position {
  column: number;
  line: number;
}

/** Where a key of an entry's metadata is written, as deep as the key path exists. */
type Locate = (keys: readonly string[]) => Position | undefined;

// A symbol key keeps the locator off the public `Entry` and out of the entry's hash. From the registry,
// because the config imports `directory()` through Vite's module runner, a different copy of this module.
const LOCATE = Symbol.for("tomekit.locate");

interface LocatedEntry extends Entry<FileInfo> {
  readonly [LOCATE]: Locate;
}

function isLocated(entry: Entry): entry is LocatedEntry {
  return LOCATE in entry;
}

interface ParseInput {
  /** Relative to the collection directory, eg `guides/setup.md`. */
  file: string;
  /** Relative to the project root. */
  filePath: string;
  /** The file's full text, frontmatter included. */
  text: string;
}

/** The file's entry, unless its YAML does not parse, and what is wrong with it. An entry with issues is still validated, so every problem shows, but left out. */
interface ParseResult {
  entry: LocatedEntry | undefined;
  issues: Issue[];
}

function position(text: string, offset: number): Position {
  const before = text.slice(0, offset);

  return {
    column: offset - before.lastIndexOf("\n"),
    line: before.split("\n").length,
  };
}

function isSlug(value: unknown): value is string {
  return new Object(value) instanceof String && value !== "";
}

/** The offset of the key or item at `keys`, as deep as the frontmatter goes. */
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

/** Splits a Markdown file into an entry: frontmatter as metadata, the rest as body. Reads nothing from disk. */
function parse({ file, filePath, text }: ParseInput): ParseResult {
  const match = FRONTMATTER.exec(text);
  const frontmatter = match?.groups?.data;

  const yaml =
    frontmatter === undefined
      ? undefined
      : parseDocument(frontmatter, { prettyErrors: false });

  /** Where an offset into the YAML is. With no offset it is the opening `---`. */
  function positionAt(offset: number | undefined): Position {
    if (offset === undefined) {
      return { column: 1, line: 1 };
    }

    const start = (match?.[0].indexOf("\n") ?? -1) + 1;

    return position(text, start + offset);
  }

  if (yaml !== undefined && yaml.errors.length > 0) {
    return {
      entry: undefined,
      issues: yaml.errors.map((error) => ({
        ...positionAt(error.pos[0]),
        message: error.message,
      })),
    };
  }

  const metadata: unknown = yaml?.toJS() ?? {};
  assertContentValue(metadata);

  const slug =
    isPlainObject(metadata) && "slug" in metadata ? metadata.slug : undefined;

  function locate(keys: readonly string[]): Position | undefined {
    return yaml === undefined ? undefined : positionAt(offsetOf(yaml, keys));
  }

  const issues =
    slug === undefined || isSlug(slug)
      ? []
      : [
          {
            ...locate(["slug"]),
            message:
              'slug: must be a non-empty string, eg "hello-world". Remove it to use the file path instead',
          },
        ];

  return {
    issues,
    entry: {
      body: match ? text.slice(match[0].length) : text,
      file: { name: path.basename(file), path: filePath },
      [LOCATE]: locate,
      metadata: isPlainObject(metadata) ? metadata : {},
      slug: isSlug(slug)
        ? slug
        : file.split(path.sep).join("/").replace(EXTENSION, ""),
    },
  };
}

export {
  isLocated,
  type Locate,
  LOCATE,
  type LocatedEntry,
  parse,
  type ParseResult,
  type Position,
};
