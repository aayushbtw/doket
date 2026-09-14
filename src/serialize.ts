const IDENTIFIER = /^[$_\p{ID_Start}][$\p{ID_Continue}]*$/u;

interface WriteState {
  /** Whether `JSON.parse` would rebuild the value exactly. */
  json: boolean;
}

// JavaScript source rather than JSON, so values JSON would drop or change
// (Dates, Maps, NaN, `undefined`) come back as they went in. Plain JSON data
// is emitted as `JSON.parse("...")` instead, which V8 loads about twice as
// fast as the same object literal.
function serialize(value: unknown): string {
  const state: WriteState = { json: true };
  const source = write(value, "", [], state);
  return state.json
    ? `JSON.parse(${JSON.stringify(JSON.stringify(value))})`
    : source;
}

function kind(value: object): string {
  const { constructor }: { constructor: unknown } = value;
  const name = typeof constructor === "function" ? constructor.name : "";
  return typeof name === "string" && name !== ""
    ? `an instance of ${name}`
    : "an object";
}

function fail(what: string, at: string): never {
  const where = at === "" ? "" : ` at ${at}`;
  throw new TypeError(
    `cannot write ${what}${where} into content. Return plain data, strings, numbers, Dates, Maps, Sets, URLs or RegExps from transform.`
  );
}

function number(value: number, state: WriteState): string {
  if (!Number.isFinite(value) || Object.is(value, -0)) {
    state.json = false;
  }
  if (Number.isNaN(value)) {
    return "NaN";
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? "Infinity" : "-Infinity";
  }
  return Object.is(value, -0) ? "-0" : String(value);
}

function write(
  value: unknown,
  at: string,
  parents: object[],
  state: WriteState
): string {
  if (value === undefined) {
    state.json = false;
    return "undefined";
  }
  if (typeof value === "number") {
    return number(value, state);
  }
  if (
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    fail(`a ${typeof value}`, at);
  }
  if (typeof value !== "object" || value === null) {
    return JSON.stringify(value);
  }
  if (parents.includes(value)) {
    fail("a circular reference", at);
  }

  const inner = [...parents, value];
  function item(entry: unknown, key: string): string {
    return write(entry, key, inner, state);
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  if (
    prototype !== Object.prototype &&
    prototype !== null &&
    !Array.isArray(value)
  ) {
    state.json = false;
  }

  if (value instanceof Date) {
    return `new Date(${number(value.getTime(), state)})`;
  }
  if (value instanceof URL) {
    return `new URL(${JSON.stringify(value.href)})`;
  }
  if (value instanceof RegExp) {
    return `new RegExp(${JSON.stringify(value.source)},${JSON.stringify(value.flags)})`;
  }
  if (value instanceof Map) {
    const pairs = [...value].map(
      ([key, entry], index) =>
        `[${item(key, `${at}[${index}][0]`)},${item(entry, `${at}[${index}][1]`)}]`
    );
    return `new Map([${pairs.join(",")}])`;
  }
  if (value instanceof Set) {
    const entries = [...value].map((entry, index) =>
      item(entry, `${at}[${index}]`)
    );
    return `new Set([${entries.join(",")}])`;
  }
  if (Array.isArray(value)) {
    const entries = Array.from(value, (entry, index) =>
      item(entry, `${at}[${index}]`)
    );
    return `[${entries.join(",")}]`;
  }

  if (prototype !== Object.prototype && prototype !== null) {
    fail(kind(value), at);
  }
  const entries = Object.entries(value).map(([key, entry]) => {
    let path = `${at}[${JSON.stringify(key)}]`;
    if (IDENTIFIER.test(key)) {
      path = at === "" ? key : `${at}.${key}`;
    }
    // Computed, so a `__proto__` key stays a key instead of setting the prototype.
    return `[${JSON.stringify(key)}]:${item(entry, path)}`;
  });
  return `{${entries.join(",")}}`;
}

export { serialize };
