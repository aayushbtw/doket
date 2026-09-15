import { describe, expect, it } from "vite-plus/test";

import { assertTransformResult, buildDocument } from "../src/document";
import {
  TransformResultError,
  UnknownTransformFieldError,
  UnserializableValueError,
} from "../src/errors";
import type { Source } from "../src/index";

const source: Source<object> = {
  body: "Text",
  file: { name: "a.md", path: "content/a.md" },
  metadata: { title: "A" },
  slug: "a",
};

describe("assertTransformResult", () => {
  it("accepts an object with metadata, body, both or neither", () => {
    for (const result of [
      {},
      { body: "B" },
      { metadata: {} },
      { body: 1, metadata: null },
    ]) {
      expect(() => {
        assertTransformResult(result);
      }).not.toThrow();
    }
  });

  it("rejects anything but a plain object", () => {
    for (const result of [null, undefined, "text", [], new Map()]) {
      expect(() => {
        assertTransformResult(result);
      }).toThrow(TransformResultError);
    }
  });

  it("names the field documents do not have", () => {
    expect(() => {
      assertTransformResult({ metadata: {}, url: "/a" });
    }).toThrow(new UnknownTransformFieldError("url"));
  });
});

describe("buildDocument", () => {
  it("keeps whatever the result leaves out", () => {
    expect(buildDocument(source, {})).toStrictEqual(source);
  });

  it("replaces metadata and body when the result has them, even as undefined", () => {
    expect(
      buildDocument(source, { body: undefined, metadata: { title: "B" } })
    ).toStrictEqual({
      body: undefined,
      file: source.file,
      metadata: { title: "B" },
      slug: "a",
    });
  });

  it("names the key path of a value that cannot be written", () => {
    expect(() =>
      buildDocument(source, { metadata: { at: Symbol("x") } })
    ).toThrow(UnserializableValueError);
    expect(() =>
      buildDocument(source, { metadata: { at: Symbol("x") } })
    ).toThrow("cannot write a symbol at metadata.at into content");
  });
});
