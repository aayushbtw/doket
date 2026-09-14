import { describe, expect, it } from "vite-plus/test";

import { serialize } from "../src/serialize";

async function evaluate(code: string): Promise<unknown> {
  const module: unknown = await import(
    `data:text/javascript,export default ${encodeURIComponent(code)}`
  );
  if (typeof module !== "object" || module === null || !("default" in module)) {
    throw new Error("the serialized module has no default export");
  }
  return module.default;
}

describe("serialize", () => {
  it("round-trips plain data", async () => {
    const value = { list: [1, "two", true, null], nested: { quote: 'a "b"' } };
    expect(await evaluate(serialize(value))).toStrictEqual(value);
  });

  it("keeps dates and undefined", async () => {
    const value = { at: new Date("2026-03-27T00:00:00Z"), missing: undefined };
    expect(await evaluate(serialize(value))).toStrictEqual(value);
  });

  it("keeps numbers JSON cannot represent", async () => {
    const value = [Number.NaN, Infinity, -Infinity, -0];
    expect(await evaluate(serialize(value))).toStrictEqual(value);
  });

  it("keeps maps, sets, URLs and regular expressions", async () => {
    const value = {
      map: new Map<unknown, unknown>([
        ["a", 1],
        [2, new Set(["b"])],
      ]),
      pattern: /a\/b/giu,
      url: new URL("https://example.com/a?b=c"),
    };
    expect(await evaluate(serialize(value))).toStrictEqual(value);
  });

  it("keeps a __proto__ key as a key", async () => {
    const value: unknown = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(await evaluate(serialize(value))).toStrictEqual(value);
  });

  it("emits plain JSON data through JSON.parse, which loads faster", async () => {
    const value = { list: [1, "two", true, null], nested: { quote: 'a "b"' } };
    const source = serialize(value);
    expect(source).toMatch(/^JSON\.parse\(/u);
    expect(await evaluate(source)).toStrictEqual(value);
  });

  it("falls back to a literal when JSON.parse would change the value", () => {
    for (const value of [
      { at: new Date(0) },
      { missing: undefined },
      [-0],
      [Number.NaN],
    ]) {
      expect(serialize(value)).not.toMatch(/^JSON\.parse/u);
    }
  });

  it("names the key path of values that cannot become source", () => {
    expect(() => serialize({ a: [{ fn: () => 1 }] })).toThrow(
      "cannot write a function at a[0].fn into content"
    );
    expect(() => serialize(1n)).toThrow("cannot write a bigint into content");
    expect(() => serialize({ "a-b": new URLSearchParams() })).toThrow(
      'cannot write an instance of URLSearchParams at ["a-b"]'
    );
  });

  it("rejects circular references", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => serialize(value)).toThrow("circular reference at self");
  });
});
