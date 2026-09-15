import type { Config, Loader } from "./index";
import { isPlainObject } from "./value";

const COLLECTION_NAME = /^[A-Za-z][\dA-Za-z_]*$/u;

// A JavaScript config, or one written before loaders, can leave `loader` out.
function isLoader(value: unknown): value is Loader {
  return (
    isPlainObject(value) && "load" in value && value.load instanceof Function
  );
}

/** Problems that stop a config from loading, one message each. Empty when it is valid. */
function configIssues(config: Config): string[] {
  return Object.entries(config.collections).flatMap(([name, collection]) => [
    ...(COLLECTION_NAME.test(name)
      ? []
      : [
          `collection ${JSON.stringify(name)} has an invalid name. Use letters, digits and "_", starting with a letter, eg "blogPosts".`,
        ]),
    ...(isLoader(collection.loader)
      ? []
      : [
          `collection ${JSON.stringify(name)} has no loader. Set one, eg \`loader: directory("content/${name}")\`.`,
        ]),
  ]);
}

export { configIssues };
