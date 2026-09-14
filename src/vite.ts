import path from "node:path";

import type { ErrorPayload, Logger, Plugin, ViteDevServer } from "vite";

import {
  BrokenContentError,
  PluginNotReadyError,
  UnknownCollectionError,
} from "./errors";
import type { ContentError } from "./errors";
import { ContentLoader, MODULE_ID } from "./loader";
import type { Build } from "./loader";

const RESOLVED_ID = `\0${MODULE_ID}`;

/** Options for the {@link tomekit} Vite plugin. */
interface TomekitOptions {
  /**
   * Path to the config file, relative to the Vite root.
   *
   * @default "tomekit.config.ts"
   */
  config?: "tomekit.config.ts" | (string & Record<never, never>);
  /**
   * The folder generated types are written to, relative to the Vite root, or
   * `false` to skip them. Map `tomekit/content*` to `<types>/content*` in your
   * tsconfig `paths`.
   *
   * @default ".tomekit"
   */
  types?: ".tomekit" | false | (string & Record<never, never>);
}

/**
 * The Vite plugin that loads your collections and serves them as
 * `tomekit/content`. Content is validated at build time, so a broken file
 * fails `vite build`; in dev it is reported and left out.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { tomekit } from "tomekit/vite";
 *
 * export default defineConfig({ plugins: [tomekit()] });
 * ```
 */
function tomekit({
  config = "tomekit.config.ts",
  types = ".tomekit",
}: TomekitOptions = {}): Plugin {
  // Hook context lives in closure variables, the usual plugin shape. Content state belongs in ContentLoader.
  let loader: ContentLoader | undefined;
  let logger: Logger | undefined;
  let root = process.cwd();
  let server: ViteDevServer | undefined;
  // Each build is reported once, however many modules or environments await it.
  const reported = new WeakSet<Build>();
  // The latest build's, for a browser that connects after it was reported.
  let latestErrors: readonly ContentError[] = [];

  function errorPayload(
    errors: readonly ContentError[]
  ): ErrorPayload | undefined {
    const [first] = errors;

    if (first === undefined) {
      return undefined;
    }

    return {
      err: {
        id: path.resolve(root, first.file),
        loc: {
          column: first.column ?? 1,
          file: path.resolve(root, first.file),
          line: first.line ?? 1,
        },
        message: new BrokenContentError(errors).message,
        plugin: "tomekit",
        stack: "",
      },
      type: "error",
    };
  }

  function report(build: Build) {
    for (const warning of build.warnings) {
      logger?.warn(`[tomekit] ${warning}`);
    }

    if (build.typesWritten !== undefined) {
      logger?.info(`[tomekit] wrote types to ${build.typesWritten}`);
    }

    const payload = errorPayload(build.errors);

    if (server === undefined || payload === undefined) {
      return;
    }

    logger?.error(`[tomekit] ${payload.err.message}`);
    server.environments.client.hot.send(payload);
  }

  async function load(): Promise<Build> {
    if (loader === undefined) {
      throw new PluginNotReadyError();
    }

    const build = await loader.load();
    latestErrors = build.errors;

    if (!reported.has(build)) {
      reported.add(build);
      report(build);
    }

    // A build stops on broken content; dev leaves those files out so the rest keeps working.
    if (server === undefined && build.errors.length > 0) {
      throw new BrokenContentError(build.errors);
    }

    return build;
  }

  /** Builds now in dev, so types and errors don't wait for a page to load. */
  async function rebuild() {
    try {
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger?.error(`[tomekit] ${message}`, {
        error: error instanceof Error ? error : undefined,
        timestamp: true,
      });
    }
  }

  function reload(dev: ViteDevServer, file: string) {
    const change = loader?.affected(file);

    if (change === undefined) {
      return;
    }

    loader?.invalidate(change);
    void rebuild();

    for (const environment of Object.values(dev.environments)) {
      const modules = [...environment.moduleGraph.idToModuleMap].flatMap(
        ([id, module]) => (id.startsWith(RESOLVED_ID) ? [module] : [])
      );

      for (const module of modules) {
        environment.moduleGraph.invalidateModule(module);
      }

      if (modules.length > 0) {
        environment.hot.send({ type: "full-reload" });
      }
    }
  }

  return {
    // Loads content up front, so types exist and errors show before anything
    // imports it. A build fails here; dev logs the error and keeps serving.
    async buildStart() {
      await (server === undefined ? load() : rebuild());
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
      loader = new ContentLoader({
        configPath: path.resolve(root, config),
        root,
        types: types === false ? false : path.resolve(root, types),
      });
    },

    configureServer(dev) {
      server = dev;
      dev.watcher.on("all", (_event, file) => {
        reload(dev, file);
      });
      dev.environments.client.hot.on("vite:client:connect", (_data, client) => {
        const payload = errorPayload(latestErrors);

        if (payload !== undefined) {
          client.send(payload);
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

      try {
        const build = await load();

        if (id === RESOLVED_ID) {
          return build.index;
        }

        const name = id.slice(RESOLVED_ID.length + 1);
        const code = build.collections.get(name);

        if (code === undefined) {
          throw new UnknownCollectionError(moduleId, [
            ...build.collections.keys(),
          ]);
        }

        return code;
      } finally {
        // For `vite build --watch`; the dev server watches through `configureServer`.
        for (const file of loader?.watchFiles ?? []) {
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
