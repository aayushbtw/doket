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

  it("rejects values that cannot become source", () => {
    expect(() => serialize({ fn: () => 1 })).toThrow("function");
    expect(() => serialize(1n)).toThrow("bigint");
  });
});
