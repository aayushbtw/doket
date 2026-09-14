import { describe, expect, it } from "vite-plus/test";

import { assertContentValue } from "../src/value";

interface Cyclic {
  self?: Cyclic;
}

describe("assertContentValue", () => {
  it("accepts every value tomekit can write", () => {
    const nullPrototype = { __proto__: null, a: 1 };

    expect(() => {
      assertContentValue({
        list: [1, "two", true, null, undefined, Number.NaN],
        map: new Map([["a", new Set([new Date(0)])]]),
        nullPrototype,
        pattern: /a/u,
        url: new URL("https://example.com"),
      });
    }).not.toThrow();
  });

  it("names the key path of values that cannot become source", () => {
    expect(() => {
      assertContentValue({ a: [{ fn: () => 1 }] });
    }).toThrow("cannot write a function at a[0].fn into content");
    expect(() => {
      assertContentValue(1n);
    }).toThrow("cannot write a bigint into content");
    expect(() => {
      assertContentValue({ "a-b": new URLSearchParams() });
    }).toThrow('cannot write an instance of URLSearchParams at ["a-b"]');
    expect(() => {
      assertContentValue(new Map([["key", Symbol("s")]]));
    }).toThrow("cannot write a symbol at [0][1] into content");
  });

  it("rejects circular references, but not a value used twice", () => {
    const cyclic: Cyclic = {};

    cyclic.self = cyclic;

    const shared = { a: 1 };

    expect(() => {
      assertContentValue(cyclic);
    }).toThrow("cannot write a circular reference at self");
    expect(() => {
      assertContentValue({ first: shared, second: shared });
    }).not.toThrow();
  });
});
