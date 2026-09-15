import { glob, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { Entry, FileInfo, Loader, LoadIssue } from "./index";
import { parse } from "./parse";

const DEFAULT_INCLUDE = "**/*.md";

/**
 * A glob pattern. Suggests common ones and accepts any string.
 *
 * @internal
 */
type Glob = "**/*.md" | "**/*.mdx" | "*.md" | (string & Record<never, never>);

/** Options for {@link directory}. */
interface DirectoryOptions {
  /** Glob patterns, relative to the directory, of files to leave out, eg `"drafts/**"`. */
  exclude?: Glob | readonly Glob[];
  /**
   * Glob patterns, relative to the directory, of files to load.
   *
   * @default "**\/*.md"
   */
  include?: Glob | readonly Glob[];
}

async function isDirectory(directory: string): Promise<boolean> {
  const stats = await stat(directory).catch(() => null);

  return stats?.isDirectory() ?? false;
}

/**
 * Loads each Markdown file in a directory as an entry: its frontmatter is the
 * metadata and the rest is the body. The slug is the frontmatter's `slug`, or
 * the file's path inside the directory without the extension, eg `guides/setup`.
 *
 * @param folder Relative to the project root, eg `content/posts`.
 *
 * @example
 * ```ts
 * posts: {
 *   loader: directory("content/posts", { exclude: "drafts/**" }),
 *   schema: z.object({ title: z.string() }),
 * }
 * ```
 */
function directory(
  folder: string,
  { exclude = [], include = DEFAULT_INCLUDE }: DirectoryOptions = {}
): Loader<FileInfo> {
  const includes = [include].flat();
  const excludes = [exclude].flat();

  return {
    async load({ collection, root }) {
      const absolute = path.resolve(root, folder);
      const empty = `collections.get(${JSON.stringify(collection)}) is empty`;

      if (!(await isDirectory(absolute))) {
        return {
          entries: [],
          warnings: [
            `${collection}: directory "${folder}" does not exist, so ${empty}`,
          ],
        };
      }

      const files: string[] = [];

      for await (const file of glob(includes, {
        cwd: absolute,
        exclude: excludes,
      })) {
        files.push(file);
      }

      files.sort();

      const results = await Promise.all(
        files.map(async (file) => {
          const filePath = path.relative(root, path.join(absolute, file));

          try {
            const text = await readFile(path.join(absolute, file), "utf-8");

            return { filePath, ...parse({ file, filePath, text }) };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);

            return {
              entry: undefined,
              filePath,
              issues: [{ cause: error, message }],
            };
          }
        })
      );

      const entries: Entry<FileInfo>[] = [];
      const issues: LoadIssue[] = [];

      for (const result of results) {
        if (result.entry !== undefined) {
          entries.push(result.entry);
        }

        issues.push(
          ...result.issues.map((issue) => ({ ...issue, file: result.filePath }))
        );
      }

      return {
        entries,
        issues,
        warnings:
          files.length === 0
            ? [
                `${collection}: no files in "${folder}" match ${JSON.stringify(include)}, so ${empty}`,
              ]
            : [],
      };
    },
    watch: includes.map((pattern) => path.posix.join(folder, pattern)),
  };
}

export { directory, type DirectoryOptions, type Glob };
