import { readFile } from "node:fs/promises";
import path from "node:path";

import { runnerImport } from "vite";

import { inCollection, loadCollection } from "./collection";
import type { FileCache } from "./collection";
import { configIssues } from "./config";
import {
  ConfigLoadError,
  InvalidConfigError,
  MissingDefaultExportError,
} from "./errors";
import type { ContentError } from "./errors";
import { writeTypes } from "./generate";
import type { Config } from "./index";
import { isPlainObject } from "./value";

const MODULE_ID = "tomekit/content";

/** The generated module and what happened while building it. */
interface Build {
  /** JavaScript for the `tomekit/content` module. */
  code: string;
  /** Broken files, left out of `code`. */
  errors: ContentError[];
  /** Relative to the root, when this build rewrote them. */
  typesWritten: string | undefined;
  warnings: string[];
}

interface LoaderOptions {
  /** Absolute path of the config file. */
  configPath: string;
  root: string;
  /** Absolute path of the runtime the generated module imports. */
  runtime: string;
  /** Absolute path of the types folder, or `false` to skip them. */
  types: string | false;
}

type Change = "config" | "content";

function isConfig(value: unknown): value is Config {
  return (
    isPlainObject(value) &&
    "collections" in value &&
    isPlainObject(value.collections)
  );
}

/**
 * Owns everything that outlives one build: the imported config, per-file
 * caches, and the build in progress. Knows nothing about how errors are shown.
 */
class ContentLoader {
  readonly #options: LoaderOptions;
  #config: Promise<Config> | undefined;
  /** The last config that loaded, to match changed files while a new one loads. */
  #current: Config | undefined;
  // Kept after a failed import, so fixing a dependency of the config still reloads.
  #dependencies: string[] = [];
  readonly #caches = new Map<string, FileCache>();
  #build: Promise<Build> | undefined;
  #checkedTsconfig = false;

  constructor(options: LoaderOptions) {
    this.#options = options;
  }

  /** Files whose changes `affected` looks for, for `vite build --watch`. */
  get watchFiles(): string[] {
    const { configPath, root } = this.#options;

    const directories = Object.values(this.#current?.collections ?? {}).map(
      (collection) => path.resolve(root, collection.directory)
    );

    return [configPath, ...this.#dependencies, ...directories];
  }

  /**
   * The current build, shared by every caller until `invalidate`. A build
   * that rejects, eg on a broken config, is retried by the next call.
   */
  async load(): Promise<Build> {
    this.#build ??= this.#run();
    const build = this.#build;

    try {
      return await build;
    } catch (error) {
      if (this.#build === build) {
        this.#build = undefined;
      }

      throw error;
    }
  }

  /** What a changed file invalidates, if anything. */
  affected(file: string): Change | undefined {
    const { configPath, root } = this.#options;

    if (file === configPath || this.#dependencies.includes(file)) {
      return "config";
    }

    const matches = Object.values(this.#current?.collections ?? {}).some(
      (collection) => {
        const relative = path.relative(
          path.resolve(root, collection.directory),
          file
        );

        return (
          !relative.startsWith("..") &&
          !path.isAbsolute(relative) &&
          inCollection(collection, relative)
        );
      }
    );

    return matches ? "content" : undefined;
  }

  invalidate(change: Change): void {
    if (change === "config") {
      this.#config = undefined;
      this.#caches.clear();
    }

    this.#build = undefined;
  }

  async #importConfig(): Promise<Config> {
    const { configPath, root } = this.#options;
    const name = path.relative(root, configPath);
    let result: Awaited<ReturnType<typeof runnerImport<{ default?: unknown }>>>;

    try {
      result = await runnerImport<{ default?: unknown }>(configPath, {
        configFile: false,
        logLevel: "error",
        root,
      });
    } catch (error) {
      throw new ConfigLoadError(name, error);
    }

    this.#dependencies = result.dependencies.map((file) =>
      path.resolve(root, file)
    );
    const config = result.module.default;

    if (!isConfig(config)) {
      throw new MissingDefaultExportError(name);
    }

    return config;
  }

  async #run(): Promise<Build> {
    const { configPath, root, runtime, types } = this.#options;
    this.#config ??= this.#importConfig();
    const imported = this.#config;
    let config: Config;

    try {
      config = await imported;
    } catch (error) {
      if (this.#config === imported) {
        this.#config = undefined;
      }

      throw error;
    }

    this.#current = config;
    const issues = configIssues(config);

    if (issues.length > 0) {
      throw new InvalidConfigError(path.relative(root, configPath), issues);
    }

    const loaded = await Promise.all(
      Object.entries(config.collections).map(async ([name, collection]) => {
        const cache = this.#caches.get(name) ?? new Map();
        this.#caches.set(name, cache);
        const result = await loadCollection(name, collection, root, { cache });

        return { name, ...result };
      })
    );

    const warnings = loaded.flatMap((collection) => collection.warnings);
    let typesWritten: string | undefined;

    if (types !== false) {
      const generated = loaded.map(({ documents, name }) => ({
        name,
        slugs: documents.map((document) => document.slug),
      }));

      if (await writeTypes(types, configPath, generated)) {
        typesWritten = path.relative(root, types);
      }

      if (!this.#checkedTsconfig) {
        this.#checkedTsconfig = true;
        const warning = await this.#checkTsconfig(types);

        if (warning !== undefined) {
          warnings.push(warning);
        }
      }
    }

    const byName = loaded.map(({ documents, name }) => {
      const pairs = documents.map(
        ({ code, slug }) => `[${JSON.stringify(slug)},${code}]`
      );

      return `${JSON.stringify(name)}:createCollection([${pairs.join(",")}])`;
    });

    return {
      code: `import { createCollection, createCollections } from ${JSON.stringify(runtime)};
export const collections = createCollections({${byName.join(",")}});
`,
      errors: loaded.flatMap((collection) => collection.errors),
      typesWritten,
      warnings,
    };
  }

  /** A warning when the root tsconfig does not map `tomekit/content` to the generated types. */
  async #checkTsconfig(types: string): Promise<string | undefined> {
    const { root } = this.#options;
    let source: string;

    try {
      source = await readFile(path.join(root, "tsconfig.json"), "utf-8");
    } catch {
      return undefined;
    }

    // Paths can live in an extended or referenced tsconfig, which this does not follow.
    if (
      source.includes(`"${MODULE_ID}`) ||
      source.includes('"extends"') ||
      source.includes('"references"')
    ) {
      return undefined;
    }

    const target = `./${path.relative(root, types).split(path.sep).join("/")}/content*`;

    return `tsconfig.json does not map "${MODULE_ID}", so its imports have no collection types. Add "paths": { "${MODULE_ID}*": ["${target}"] } to compilerOptions.`;
  }
}

export { type Build, type Change, ContentLoader, MODULE_ID };
