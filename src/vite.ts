import path from "node:path";

import type { Logger, Plugin, ViteDevServer } from "vite";
import { runnerImport } from "vite";

import { writeDeclaration } from "./dts";
import type { Config } from "./index";
import { loadCollection } from "./load";
import { serialize } from "./serialize";

const MODULE_ID = "tomekit/content";
const RESOLVED_ID = `\0${MODULE_ID}`;

interface TomekitOptions {
  /** Path to the config file, relative to the Vite root. */
  config?: string;
  /**
   * Where to write the declaration that types `tomekit/content`, relative to
   * the Vite root. It must be inside your tsconfig's `include`. `false` skips
   * it, and you register the config's type yourself.
   */
  dts?: string | false;
}

function tomekit({
  config = "tomekit.config.ts",
  dts = "tomekit-env.d.ts",
}: TomekitOptions = {}): Plugin {
  let root = process.cwd();
  let logger: Logger | undefined;
  let configPath = "";
  // Every environment that imports the module shares one load per change.
  let pending: Promise<string> | undefined;
  let watched: string[] = [];

  async function build() {
    const { module, dependencies } = await runnerImport<{ default: Config }>(
      configPath,
      { configFile: false, logLevel: "error", root }
    );
    const { collections } = module.default;
    watched = [
      configPath,
      ...dependencies.map((file) => path.resolve(root, file)),
      ...collections.map((collection) =>
        path.resolve(root, collection.directory)
      ),
    ];

    const entries = await Promise.all(
      collections.map(async (collection) => {
        const loaded = await loadCollection(collection, root, (message) => {
          logger?.warn(`[tomekit] ${message}`);
        });
        const pairs = loaded.map(
          ({ output, slug }) => `[${JSON.stringify(slug)},${serialize(output)}]`
        );
        return `${JSON.stringify(collection.name)}:createCollection([${pairs.join(",")}])`;
      })
    );

    return `import { createCollection } from "tomekit/query";
export const content = {${entries.join(",")}};
`;
  }

  function reload(server: ViteDevServer) {
    pending = undefined;
    for (const environment of Object.values(server.environments)) {
      const module = environment.moduleGraph.getModuleById(RESOLVED_ID);
      if (module) {
        environment.moduleGraph.invalidateModule(module);
        environment.hot.send({ type: "full-reload" });
      }
    }
  }

  return {
    async configResolved(resolved) {
      ({ logger, root } = resolved);
      configPath = path.resolve(root, config);
      if (dts !== false) {
        const dtsPath = path.resolve(root, dts);
        if (await writeDeclaration(configPath, dtsPath)) {
          logger.info(`[tomekit] wrote ${path.relative(root, dtsPath)}`);
        }
      }
    },

    configureServer(server) {
      server.watcher.on("all", (_event, file) => {
        if (
          file === configPath ||
          watched.some(
            (entry) => file === entry || file.startsWith(`${entry}${path.sep}`)
          )
        ) {
          reload(server);
        }
      });
    },

    // Ahead of Vite's own resolver, which would otherwise find the stub that
    // `tomekit/content` ships for use without the plugin.
    enforce: "pre",

    async load(id) {
      if (id !== RESOLVED_ID) {
        return null;
      }
      pending ??= build();
      try {
        return await pending;
      } catch (error) {
        pending = undefined;
        throw error;
      } finally {
        for (const file of watched) {
          this.addWatchFile(file);
        }
      }
    },

    name: "tomekit",

    resolveId(id) {
      return id === MODULE_ID ? RESOLVED_ID : undefined;
    },
  };
}

export { tomekit, type TomekitOptions };
