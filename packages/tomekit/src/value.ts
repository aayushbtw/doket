import {
  UnserializableInstanceError,
  UnserializableValueError,
} from "./errors";

const IDENTIFIER = /^[$_\p{ID_Start}][$\p{ID_Continue}]*$/u;

const PLAIN_PROTOTYPES = new Set<object | null>([Object.prototype, null]);

/** A value tomekit can write into a generated module, as `transform` output or parsed frontmatter. */
type ContentValue =
  | ContentFields
  | Date
  | ReadonlyMap<ContentValue, ContentValue>
  | ReadonlySet<ContentValue>
  | RegExp
  | URL
  | boolean
  | number
  | readonly ContentValue[]
  | string
  | null
  | undefined;

interface ContentFields {
  readonly [key: string]: ContentValue;
}

// `new Object(value)` returns an object unchanged and boxes a primitive, so
// comparing the two, and `instanceof` on the box, tells values apart without `typeof`.

/** Whether a value is an object literal, rather than a primitive, array or instance of a class. */
function isPlainObject(value: unknown): value is object {
  if (value === null || value === undefined || new Object(value) !== value) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  return (
    !Array.isArray(value) &&
    (prototype === Object.prototype || prototype === null)
  );
}

function isNumber(value: ContentValue): value is number {
  return new Object(value) instanceof Number;
}

function isList(value: ContentValue): value is readonly ContentValue[] {
  return Array.isArray(value);
}

function isMap(
  value: ContentValue
): value is ReadonlyMap<ContentValue, ContentValue> {
  return value instanceof Map;
}

function isSet(value: ContentValue): value is ReadonlySet<ContentValue> {
  return value instanceof Set;
}

// Called only on checked values, so an object that is none of the other kinds is a plain object.
function isFields(value: ContentValue): value is ContentFields {
  return (
    value !== null &&
    value !== undefined &&
    new Object(value) === value &&
    !isList(value) &&
    !isMap(value) &&
    !isSet(value) &&
    !(value instanceof Date) &&
    !(value instanceof RegExp) &&
    !(value instanceof URL)
  );
}

/** Where `key` sits inside `at`, eg `meta.tags` or `meta["a-b"]`. */
function keyPath(at: string, key: string): string {
  if (!IDENTIFIER.test(key)) {
    return `${at}[${JSON.stringify(key)}]`;
  }

  return at === "" ? key : `${at}.${key}`;
}

/**
 * Checks that a value can be written into content, and throws an
 * `UnserializableValueError` naming the key path of the first one that cannot.
 */
function assertContentValue(
  value: unknown,
  at = "",
  parents = new WeakSet<object>()
): asserts value is ContentValue {
  if (value === undefined || value === null) {
    return;
  }

  const boxed = new Object(value);

  if (boxed !== value) {
    if (
      boxed instanceof Boolean ||
      boxed instanceof Number ||
      boxed instanceof String
    ) {
      return;
    }

    throw new UnserializableValueError(
      boxed instanceof Symbol ? "a symbol" : "a bigint",
      at
    );
  }

  if (boxed instanceof Function) {
    throw new UnserializableValueError("a function", at);
  }

  if (parents.has(boxed)) {
    throw new UnserializableValueError("a circular reference", at);
  }

  if (
    boxed instanceof Date ||
    boxed instanceof RegExp ||
    boxed instanceof URL
  ) {
    return;
  }

  let children: (readonly [string, unknown])[];

  if (boxed instanceof Map) {
    children = [...boxed].flatMap(([key, entry], index) => [
      [`${at}[${index}][0]`, key],
      [`${at}[${index}][1]`, entry],
    ]);
  } else if (boxed instanceof Set) {
    children = [...boxed].map((entry, index) => [`${at}[${index}]`, entry]);
  } else if (Array.isArray(boxed)) {
    // `entries()`, not `map`: `map` keeps a sparse array's holes, which the loop below can't destructure.
    children = Array.from(boxed.entries(), ([index, entry]) => [
      `${at}[${index}]`,
      entry,
    ]);
  } else {
    if (!PLAIN_PROTOTYPES.has(Reflect.getPrototypeOf(boxed))) {
      throw new UnserializableInstanceError(boxed.constructor.name, at);
    }

    children = Object.entries(boxed).map(([key, entry]) => [
      keyPath(at, key),
      entry,
    ]);
  }

  parents.add(boxed);

  try {
    for (const [path, child] of children) {
      assertContentValue(child, path, parents);
    }
  } finally {
    parents.delete(boxed);
  }
}

export {
  assertContentValue,
  type ContentFields,
  type ContentValue,
  isFields,
  isList,
  isMap,
  isNumber,
  isPlainObject,
  isSet,
};
