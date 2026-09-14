import { typeName } from "./generate";
import type { Config } from "./index";

const COLLECTION_NAME = /^[A-Za-z][\dA-Za-z_]*$/u;

/** Problems that stop a config from loading, one message each. Empty when it is valid. */
function configIssues(config: Config): string[] {
  const names = Object.keys(config.collections);

  const issues = names
    .filter((name) => !COLLECTION_NAME.test(name))
    .map(
      (name) =>
        `collection ${JSON.stringify(name)} has an invalid name. Use letters, digits and "_", starting with a letter, eg "blogPosts".`
    );

  const valid = names.filter((name) => COLLECTION_NAME.test(name));

  // Each collection generates `<Type>` and `<Type>Slug`, beside the shared `AnyDocument`.
  const generated = valid.flatMap((name) => [
    { name, type: typeName(name) },
    { name, type: `${typeName(name)}Slug` },
  ]);

  const byType = new Map<string, string[]>([["AnyDocument", []]]);

  for (const { name, type } of generated) {
    byType.set(type, [...(byType.get(type) ?? []), name]);
  }

  for (const [type, group] of byType) {
    const clash = new Set(group);

    if (type === "AnyDocument" && clash.size > 0) {
      issues.push(
        `collection ${list([...clash])} generates the type AnyDocument, which tomekit already exports. Rename it.`
      );
    } else if (clash.size > 1) {
      issues.push(
        `collections ${list([...clash])} generate the same type ${type}. Rename all but one.`
      );
    }
  }

  // Names that differ only in case would write the same types file on macOS and Windows.
  const byFile = groupBy(valid, (name) => name.toLowerCase());

  for (const group of byFile.values()) {
    if (group.length > 1) {
      issues.push(
        `collections ${list(group)} differ only in case, so their generated files collide on case-insensitive file systems. Rename all but one.`
      );
    }
  }

  return issues;
}

function groupBy(
  names: readonly string[],
  key: (name: string) => string
): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const name of names) {
    groups.set(key(name), [...(groups.get(key(name)) ?? []), name]);
  }

  return groups;
}

function list(names: readonly string[]): string {
  return names.map((name) => JSON.stringify(name)).join(" and ");
}

export { configIssues };
