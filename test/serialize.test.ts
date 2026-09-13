import { describe, expect, it } from "vitest";

import { serialize } from "../src/serialize";

async function evaluate(code: string): Promise<unknown> {
  const module = await import(
    `data:text/javascript,export default ${encodeURIComponent(code)}`
  );
  return module.default;
}

describe("serialize", () => {
  it("round-trips plain data", async () => {
    const value = { list: [1, "two", true, null], nested: { quote: 'a "b"' } };
    expect(await evaluate(serialize(value))).toStrictEqual(value);
  });

  it("keeps dates and undefined", async () => {
    const value = { at: new Date("2026-03-27T00:00:00Z"), missing: undefined };
    const result = (await evaluate(serialize(value))) as typeof value;
    expect(result.at).toBeInstanceOf(Date);
    expect(result.at.getTime()).toBe(value.at.getTime());
    expect(Object.hasOwn(result, "missing")).toBe(true);
    expect(result.missing).toBeUndefined();
  });

  it("rejects values that cannot become source", () => {
    expect(() => serialize({ fn: () => 1 })).toThrow("function");
    expect(() => serialize(1n)).toThrow("bigint");
  });
});
