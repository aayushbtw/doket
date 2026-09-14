import type { Config } from "./index";

const COLLECTION_NAME = /^[A-Za-z][\dA-Za-z_]*$/u;

/** Problems that stop a config from loading, one message each. Empty when it is valid. */
function configIssues(config: Config): string[] {
  return Object.keys(config.collections)
    .filter((name) => !COLLECTION_NAME.test(name))
    .map(
      (name) =>
        `collection ${JSON.stringify(name)} has an invalid name. Use letters, digits and "_", starting with a letter, eg "blogPosts".`
    );
}

export { configIssues };
