import { collectMarkdownHeadings } from "@tanstack/markdown/extensions/headings";
import { parseMarkdown } from "@tanstack/markdown/parser";
import { defineConfig } from "tomekit";
import { z } from "zod";

import { sections } from "./src/lib/sections";

export default defineConfig({
  collections: {
    docs: {
      directory: "content/docs",
      schema: z.object({
        description: z.string(),
        order: z.number(),
        section: z.enum(sections),
        title: z.string(),
      }),
      transform: ({ body, metadata }) => {
        const document = parseMarkdown(body, { headingIds: true });

        const headings = collectMarkdownHeadings(document).flatMap(
          ({ id, level, text }) => (level === 2 ? [{ id, text }] : [])
        );

        return { body: document, metadata: { ...metadata, headings } };
      },
    },
  },
});
