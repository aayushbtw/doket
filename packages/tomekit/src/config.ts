import type { Config, Loader } from "./index";
import { isPlainObject } from "./value";

const COLLECTION_NAME = /^[A-Za-z][\dA-Za-z_]*$/u;

// A JavaScript config, or one written before loaders, can leave `loader` out.
function isLoader(value: unknown): value is Loader {
  return (
    isPlainObject(value) && "load" in value && value.load instanceof Function
  );
}

function isKeyPath(path: string): boolean {
  return path.split(".").every((key) => key !== "");
}

/** Problems with `references`, which TypeScript checks too, for a JavaScript config or a cast. */
function referenceIssues(config: Config): string[] {
  const references: unknown = config.references;

  if (references === undefined) {
    return [];
  }

  if (!isPlainObject(references)) {
    return [
      'references must be an object keyed by collection name, eg `references: { posts: { author: "authors" } }`.',
    ];
  }

  const names = Object.keys(config.collections);
  const choices = names.map((name) => JSON.stringify(name)).join(", ");

  return Object.entries(references).flatMap(([name, paths]) => {
    const at = `references.${name}`;

    if (!names.includes(name)) {
      return [
        `${at}: there is no collection ${JSON.stringify(name)}. Use one of ${choices}.`,
      ];
    }

    if (!isPlainObject(paths)) {
      return [
        `${at} must be an object from key path to collection name, eg \`{ author: "authors" }\`.`,
      ];
    }

    return Object.entries(paths).flatMap(([path, target]) => {
      const key = `${at}[${JSON.stringify(path)}]`;

      if (!isKeyPath(path)) {
        return [
          `${key} is not a key path. Separate keys with ".", eg "sections.author".`,
        ];
      }

      return new Object(target) instanceof String &&
        names.includes(String(target))
        ? []
        : [
            `${key} must name a collection, got ${JSON.stringify(target)}. Use one of ${choices}.`,
          ];
    });
  });
}

/** Problems that stop a config from loading, one message each. Empty when it is valid. */
function configIssues(config: Config): string[] {
  return [
    ...Object.entries(config.collections).flatMap(([name, collection]) => [
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
    ]),
    ...referenceIssues(config),
  ];
}

export { configIssues };
