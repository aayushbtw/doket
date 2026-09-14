import { isFields, isList, isMap, isNumber, isSet } from "./value";
import type { ContentValue } from "./value";

interface WriteState {
  /** Whether `JSON.parse` would rebuild the value exactly. */
  json: boolean;
}

// JavaScript source rather than JSON, so values JSON would drop or change
// (Dates, Maps, NaN, `undefined`) come back as they went in. Plain JSON data
// is emitted as `JSON.parse("...")` instead, which V8 loads about twice as
// fast as the same object literal.
function serialize(value: ContentValue): string {
  const state: WriteState = { json: true };
  const source = write(value, state);

  return state.json
    ? `JSON.parse(${JSON.stringify(JSON.stringify(value))})`
    : source;
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

function write(value: ContentValue, state: WriteState): string {
  if (value === undefined) {
    state.json = false;

    return "undefined";
  }

  if (isNumber(value)) {
    return number(value, state);
  }

  if (isList(value)) {
    return `[${value.map((entry) => write(entry, state)).join(",")}]`;
  }

  if (isFields(value)) {
    const entries = Object.entries(value).map(
      // Computed, so a `__proto__` key stays a key instead of setting the prototype.
      ([key, entry]) => `[${JSON.stringify(key)}]:${write(entry, state)}`
    );

    return `{${entries.join(",")}}`;
  }

  if (isMap(value)) {
    state.json = false;

    const pairs = [...value].map(
      ([key, entry]) => `[${write(key, state)},${write(entry, state)}]`
    );

    return `new Map([${pairs.join(",")}])`;
  }

  if (isSet(value)) {
    state.json = false;
    const entries = [...value].map((entry) => write(entry, state));

    return `new Set([${entries.join(",")}])`;
  }

  if (value instanceof Date) {
    state.json = false;

    return `new Date(${number(value.getTime(), state)})`;
  }

  if (value instanceof URL) {
    state.json = false;

    return `new URL(${JSON.stringify(value.href)})`;
  }

  if (value instanceof RegExp) {
    state.json = false;

    return `new RegExp(${JSON.stringify(value.source)},${JSON.stringify(value.flags)})`;
  }

  return JSON.stringify(value);
}

export { serialize };
