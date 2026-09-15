import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import type { Entry } from "../src/index";
import { validate } from "../src/validate";

const titled = z.object({ title: z.string() });

describe("validate", () => {
  it("builds the source, with an empty body by default", async () => {
    const entry: Entry = { metadata: { title: "A" }, slug: "a" };

    expect(await validate(entry, { title: "A" }, titled)).toStrictEqual({
      source: {
        body: "",
        file: undefined,
        metadata: { title: "A" },
        slug: "a",
      },
    });
  });

  it("points each issue at where the locator puts its key", async () => {
    const { issues = [] } = await validate(
      { slug: "a" },
      { tags: [1] },
      titled,
      (keys) => ({ column: keys.length, line: 7 })
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ column: 1, line: 7 });
    expect(issues[0]?.message).toMatch(/^title: /u);
  });

  it("leaves line and column out without a locator", async () => {
    const { issues = [] } = await validate({ slug: "a" }, {}, titled);

    expect(issues).toHaveLength(1);
    expect(Object.keys(issues[0] ?? {})).toStrictEqual(["message"]);
  });

  it("names no key for an issue about the whole metadata", async () => {
    const { issues = [] } = await validate(
      { slug: "a" },
      { title: "A" },
      titled.refine(() => false, "needs a date or a draft flag")
    );

    expect(issues).toStrictEqual([{ message: "needs a date or a draft flag" }]);
  });

  it("fails when the schema does not produce an object", async () => {
    const result = await validate(
      { slug: "a" },
      { title: "A" },
      titled.transform((data) => data.title)
    );

    expect(result).toStrictEqual({
      issues: [{ message: "the schema must produce an object" }],
    });
  });
});
