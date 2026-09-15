import { readFile } from "node:fs/promises";
import path from "node:path";

import { runnerImport } from "vite";

import { loadCollection } from "./collection";
import type { CollectionResult, EntryCache } from "./collection";
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

interface BuilderOptions {
  /** Absolute path of the config file. */
  configPath: string;
  root: string;
  /** Absolute path of the runtime the generated module imports. */
  runtime: string;
  /** Absolute path of the types folder, or `false` to skip them. */
  types: string | false;
}

const GLOB_CHARACTER = /[*?[{]/u;

/** The part of a glob pattern before its first wildcard, eg `content/posts` for `content/posts/**\/*.md`. */
function globBase(pattern: string): string {
  const segments = pattern.split("/");

  const wildcard = segments.findIndex((segment) =>
    GLOB_CHARACTER.test(segment)
  );

  return (wildcard === -1 ? segments : segments.slice(0, wildcard)).join("/");
}

function watchPatterns(root: string, config: Config | undefined) {
  return Object.entries(config?.collections ?? {}).flatMap(
    ([name, collection]) =>
      [collection.loader.watch ?? []]
        .flat()
        .map((pattern) => ({ name, pattern: path.resolve(root, pattern) }))
  );
}

function isConfig(value: unknown): value is Config {
  return (
    isPlainObject(value) &&
    "collections" in value &&
    isPlainObject(value.collections)
  );
}

/**
 * Owns everything that outlives one build: the imported config, each
 * collection's last result and entry cache, and the build in progress. Knows
 * nothing about how errors are shown.
 */
class ContentBuilder {
  readonly #options: BuilderOptions;
  #config: Promise<Config> | undefined;
  /** The last config that loaded, to match changed files while a new one loads. */
  #current: Config | undefined;
  // Kept after a failed import, so fixing a dependency of the config still reloads.
  #dependencies: string[] = [];
  readonly #caches = new Map<string, EntryCache>();
  /** Each collection's last result, reused until one of its `watch` files or the config changes. */
  readonly #results = new Map<string, CollectionResult>();
  /** Bumped on every change, so a build that started before it doesn't keep stale results. */
  #version = 0;
  #build: Promise<Build> | undefined;
  #checkedTsconfig = false;

  constructor(options: BuilderOptions) {
    this.#options = options;
  }

  /** Files and folders whose changes `changed` looks for, for the dev watcher and `vite build --watch`. */
  get watchFiles(): string[] {
    const { configPath, root } = this.#options;

    const bases = watchPatterns(root, this.#current).map(({ pattern }) =>
      globBase(pattern)
    );

    return [...new Set([configPath, ...this.#dependencies, ...bases])];
  }

  /**
   * The current build, shared by every caller until a change. A build that
   * rejects, eg on a broken config, is retried by the next call.
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

  /**
   * Drops what a changed file invalidates: everything for the config or its
   * dependencies, otherwise the collections that watch it. Returns whether
   * anything was dropped.
   */
  changed(file: string): boolean {
    const { configPath, root } = this.#options;

    if (file === configPath || this.#dependencies.includes(file)) {
      this.#config = undefined;
      this.#caches.clear();
      this.#results.clear();
    } else {
      const names = watchPatterns(root, this.#current)
        .filter(({ pattern }) => path.matchesGlob(file, pattern))
        .map(({ name }) => name);

      if (names.length === 0) {
        return false;
      }

      for (const name of names) {
        this.#results.delete(name);
      }
    }

    this.#version += 1;
    this.#build = undefined;

    return true;
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

    const version = this.#version;

    const loaded = await Promise.all(
      Object.entries(config.collections).map(async ([name, collection]) => {
        const cache = this.#caches.get(name) ?? new Map();
        this.#caches.set(name, cache);

        const result =
          this.#results.get(name) ??
          (await loadCollection(name, collection, root, { cache }));

        if (this.#version === version) {
          this.#results.set(name, result);
        }

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

export { type Build, ContentBuilder, MODULE_ID };
