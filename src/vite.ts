import path from "node:path";

import type { Plugin, ViteDevServer } from "vite";
import { runnerImport } from "vite";

import type { Config } from "./index";
import { loadCollection } from "./load";
import { serialize } from "./serialize";

const MODULE_ID = "virtual:tomekit";
const RESOLVED_ID = `\0${MODULE_ID}`;

interface TomekitOptions {
  /** Path to the config file, relative to the Vite root. */
  config?: string;
}

function tomekit({
  config = "tomekit.config.ts",
}: TomekitOptions = {}): Plugin {
  let root = process.cwd();
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

    const exports = await Promise.all(
      collections.map(async (collection) => {
        const entries = await loadCollection(collection, root);
        const pairs = entries.map(
          ({ output, slug }) => `[${JSON.stringify(slug)},${serialize(output)}]`
        );
        return `${JSON.stringify(collection.name)}:collection([${pairs.join(",")}])`;
      })
    );

    return `function collection(entries) {
  const documents = entries.map((entry) => entry[1]);
  const bySlug = new Map(entries);
  return { all: () => documents, get: (slug) => bySlug.get(slug) };
}
export const collections = {${exports.join(",")}};
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
    configResolved(resolved) {
      ({ root } = resolved);
      configPath = path.resolve(root, config);
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
