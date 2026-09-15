import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { defineCollection, defineConfig, defineLoader } from "../src/index";

describe("define helpers", () => {
  it("return what they are given, so a config stays plain data", () => {
    const loader = defineLoader({ load: () => ({ entries: [] }) });
    const collection = defineCollection({ loader, schema: z.object({}) });
    const config = { collections: { pages: collection } };

    expect(defineLoader(loader)).toBe(loader);
    expect(defineCollection(collection)).toBe(collection);
    expect(defineConfig(config)).toBe(config);
  });
});
