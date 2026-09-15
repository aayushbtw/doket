import { describe, expect, it } from "vite-plus/test";

import { serialize } from "../src/serialize";
import { assertContentValue } from "../src/value";
import type { ContentValue } from "../src/value";

async function evaluate(code: string): Promise<ContentValue> {
  const module: unknown = await import(
    `data:text/javascript,export default ${encodeURIComponent(code)}`
  );

  if (module === null || module === undefined) {
    throw new Error("the serialized module did not load");
  }

  const exported: unknown = Object.getOwnPropertyDescriptor(
    module,
    "default"
  )?.value;

  assertContentValue(exported);

  return exported;
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
      map: new Map<ContentValue, ContentValue>([
        ["a", 1],
        [2, new Set(["b"])],
      ]),
      pattern: /a\/b/giu,
      url: new URL("https://example.com/a?b=c"),
    };

    expect(await evaluate(serialize(value))).toStrictEqual(value);
  });

  it("keeps holes in sparse arrays", async () => {
    const sparse: ContentValue[] = [1];

    sparse[2] = 3;

    const trailing: ContentValue[] = [1];

    trailing.length = 2;

    expect(await evaluate(serialize(sparse))).toStrictEqual(sparse);
    expect(await evaluate(serialize(trailing))).toStrictEqual(trailing);
  });

  it("keeps a __proto__ key as a key", async () => {
    const value: unknown = JSON.parse('{"__proto__":{"polluted":true}}');

    assertContentValue(value);

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
});
