import { describe, expect, it } from "vite-plus/test";

import {
  BrokenContentError,
  ConfigError,
  ConfigLoadError,
  ContentError,
  InvalidConfigError,
  MissingDefaultExportError,
  MissingPluginError,
  PluginError,
  PluginNotReadyError,
  TomekitError,
  TransformError,
  TransformResultError,
  UnknownTransformFieldError,
  UnserializableInstanceError,
  UnserializableValueError,
} from "../src/errors";

describe("errors", () => {
  it("names each error after its class, under a shared base", () => {
    const cases = [
      [new ConfigLoadError("tomekit.config.ts", new Error("x")), ConfigError],
      [new MissingDefaultExportError("tomekit.config.ts"), ConfigError],
      [new InvalidConfigError("tomekit.config.ts", ["a"]), ConfigError],
      [new ContentError("a.md", { message: "x" }), TomekitError],
      [new BrokenContentError([]), TomekitError],
      [new UnserializableValueError("a function", "a"), TransformError],
      [new UnserializableInstanceError("Author", "a"), TransformError],
      [new TransformResultError(), TransformError],
      [new UnknownTransformFieldError("url"), TransformError],
      [new MissingPluginError(), PluginError],
      [new PluginNotReadyError(), PluginError],
    ] as const;

    for (const [error, category] of cases) {
      expect(error).toBeInstanceOf(category);
      expect(error).toBeInstanceOf(TomekitError);
      expect(error.name).toBe(error.constructor.name);
    }
  });

  it("exports every error class from tomekit", async () => {
    const errors = await import("../src/errors");
    const tomekit = await import("../src/index");

    expect(Object.keys(tomekit)).toEqual(
      expect.arrayContaining(Object.keys(errors))
    );
  });

  it("keeps what caused a config to fail to load", () => {
    const cause = new SyntaxError("Unexpected token");
    const error = new ConfigLoadError("tomekit.config.ts", cause);

    expect(error.message).toBe(
      "tomekit.config.ts failed to load: Unexpected token"
    );
    expect(error.cause).toBe(cause);
  });

  it("prints a content error with as much location as it has", () => {
    expect(
      new ContentError("a.md", { column: 5, line: 4, message: "tags.1: bad" })
        .message
    ).toBe("a.md:4:5: tags.1: bad");
    expect(new ContentError("a.md", { message: "bad" }).message).toBe(
      "a.md: bad"
    );
  });

  it("counts files, not errors, in a broken build", () => {
    const error = new BrokenContentError([
      new ContentError("a.md", { line: 2, message: "title: bad" }),
      new ContentError("a.md", { line: 3, message: "date: bad" }),
    ]);

    expect(error.message).toBe(
      "1 content file has errors:\na.md:2: title: bad\na.md:3: date: bad"
    );
    expect(error.errors).toHaveLength(2);
  });
});
