// JSON with Dates and `undefined` kept, since the output is JavaScript source
// rather than a JSON payload.
function serialize(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value instanceof Date) {
    return `new Date(${value.getTime()})`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(serialize).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).map(
      ([key, entry]) => `${JSON.stringify(key)}:${serialize(entry)}`
    );
    return `{${entries.join(",")}}`;
  }
  if (
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new TypeError(`Cannot serialize a ${typeof value} into content`);
  }
  return JSON.stringify(value);
}

export { serialize };
