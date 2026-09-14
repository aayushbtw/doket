import path from "node:path";

import type { Logger, Plugin, ViteDevServer } from "vite";
import { runnerImport } from "vite";

import { writeTypes } from "./generate";
import type { Config } from "./index";
import { inCollection, loadCollection } from "./load";
import type { FileCache } from "./load";

const MODULE_ID = "tomekit/content";
const RESOLVED_ID = `\0${MODULE_ID}`;

interface Modules {
  collections: Map<string, string>;
  index: string;
}

interface TomekitOptions {
  /** Path to the config file, relative to the Vite root. */
  config?: string;
  /**
   * The folder generated types are written to, relative to the Vite root.
   * Point `tomekit/content` at `<types>/content` in your tsconfig `paths`.
   * `false` skips writing them.
   */
  types?: string | false;
}

function tomekit({
  config = "tomekit.config.ts",
  types = ".tomekit",
}: TomekitOptions = {}): Plugin {
  let root = process.cwd();
  let logger: Logger | undefined;
  let serving = false;
  let configPath = "";
  let loadedConfig: Promise<Config> | undefined;
  // Kept after a failed load, so fixing a dependency of the config still reloads.
  let dependencies: string[] = [];
  let current: Config | undefined;
  const caches = new Map<string, FileCache>();
  // Every environment that imports the module shares one build per change.
  let pending: Promise<Modules> | undefined;

  async function importConfig(): Promise<Config> {
    const result = await runnerImport<{ default: Config }>(configPath, {
      configFile: false,
      logLevel: "error",
      root,
    });
    dependencies = result.dependencies.map((file) => path.resolve(root, file));
    return result.module.default;
  }

  async function build(): Promise<Modules> {
    loadedConfig ??= importConfig();
    current = await loadedConfig.catch((error: unknown) => {
      loadedConfig = undefined;
      throw error;
    });

    const collections = await Promise.all(
      Object.entries(current.collections).map(async ([name, collection]) => {
        const cache = caches.get(name) ?? new Map();
        caches.set(name, cache);
        const entries = await loadCollection(name, collection, root, {
          cache,
          // In dev a broken file is reported and left out, so the rest of the site keeps working.
          onError: serving
            ? (error) => logger?.error(`[tomekit] ${error.message}`)
            : undefined,
          warn: (message) => logger?.warn(`[tomekit] ${message}`),
        });
        const pairs = entries.map(
          ({ code, slug }) => `[${JSON.stringify(slug)},${code}]`
        );
        return {
          code: `import { createCollection } from "tomekit/query";
export default createCollection([${pairs.join(",")}]);
`,
          name,
          slugs: entries.map((entry) => entry.slug),
        };
      })
    );

    if (types !== false) {
      const directory = path.resolve(root, types);
      if (await writeTypes(directory, configPath, collections)) {
        logger?.info(
          `[tomekit] wrote types to ${path.relative(root, directory)}`
        );
      }
    }

    const imports = collections.map(
      ({ name }, index) =>
        `import c${index} from ${JSON.stringify(`${MODULE_ID}/${name}`)};`
    );
    const keys = collections.map(
      ({ name }, index) => `${JSON.stringify(name)}:c${index}`
    );
    return {
      collections: new Map(collections.map(({ code, name }) => [name, code])),
      index: `${imports.join("\n")}
export const content = {${keys.join(",")}};
`,
    };
  }

  /** What a changed file invalidates, if anything. */
  function affected(file: string): "config" | "content" | undefined {
    if (file === configPath || dependencies.includes(file)) {
      return "config";
    }
    const matches = Object.values(current?.collections ?? {}).some(
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

  function reload(server: ViteDevServer, change: "config" | "content") {
    if (change === "config") {
      loadedConfig = undefined;
      caches.clear();
    }
    pending = undefined;
    for (const environment of Object.values(server.environments)) {
      const modules = [...environment.moduleGraph.idToModuleMap]
        .filter(([id]) => id.startsWith(RESOLVED_ID))
        .map(([, module]) => module);
      for (const module of modules) {
        environment.moduleGraph.invalidateModule(module);
      }
      if (modules.length > 0) {
        environment.hot.send({ type: "full-reload" });
      }
    }
  }

  return {
    // Loads content up front, so types exist before anything imports it.
    async buildStart() {
      pending ??= build();
      await pending.catch(() => {
        pending = undefined;
      });
    },

    // Pre-bundling would cache tomekit's runtime by version, so a linked or
    // locally built tomekit could keep serving stale code, and the plugin's
    // own module must never be bundled from its stub.
    configEnvironment() {
      return {
        optimizeDeps: { exclude: ["tomekit", MODULE_ID, "tomekit/query"] },
      };
    },

    configResolved(resolved) {
      ({ logger, root } = resolved);
      serving = resolved.command === "serve";
      configPath = path.resolve(root, config);
    },

    configureServer(server) {
      server.watcher.on("all", (_event, file) => {
        const change = affected(file);
        if (change !== undefined) {
          reload(server, change);
        }
      });
    },

    // Ahead of Vite's own resolver, which would otherwise find the stub that
    // `tomekit/content` ships for use without the plugin.
    enforce: "pre",

    async load(id) {
      if (!id.startsWith(RESOLVED_ID)) {
        return null;
      }
      const moduleId = id.slice(1);
      if (this.environment.name === "client") {
        logger?.warn(
          `[tomekit] ${moduleId} was imported in the browser bundle, so its documents ship to the client. Import it from server code only.`
        );
      }
      pending ??= build();
      try {
        const modules = await pending;
        if (id === RESOLVED_ID) {
          return modules.index;
        }
        const name = id.slice(RESOLVED_ID.length + 1);
        const code = modules.collections.get(name);
        if (code === undefined) {
          const known = [...modules.collections.keys()]
            .map((key) => JSON.stringify(key))
            .join(", ");
          throw new Error(
            `[tomekit] ${moduleId} does not exist. Collections in the config: ${known || "none"}.`
          );
        }
        return code;
      } catch (error) {
        pending = undefined;
        throw error;
      } finally {
        // For `vite build --watch`; the dev server watches through `configureServer`.
        const directories = Object.values(current?.collections ?? {}).map(
          (collection) => path.resolve(root, collection.directory)
        );
        for (const file of [configPath, ...dependencies, ...directories]) {
          this.addWatchFile(file);
        }
      }
    },

    name: "tomekit",

    resolveId(id) {
      return id === MODULE_ID || id.startsWith(`${MODULE_ID}/`)
        ? `\0${id}`
        : undefined;
    },
  };
}

export { tomekit, type TomekitOptions };
