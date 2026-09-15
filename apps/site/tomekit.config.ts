import { collectMarkdownHeadings } from "@tanstack/markdown/extensions/headings";
import { parseMarkdown } from "@tanstack/markdown/parser";
import { defineConfig, directory } from "tomekit";
import type { Source } from "tomekit";
import { z } from "zod";

import { apiReference, apiReferenceWatch } from "./src/lib/api-reference";
import { sections } from "./src/lib/sections";

function withHeadings<TMetadata extends object>({
  body,
  metadata,
}: Source<TMetadata>) {
  const document = parseMarkdown(body, { headingIds: true });

  const headings = collectMarkdownHeadings(document).flatMap(
    ({ id, level, text }) => (level === 2 ? [{ id, text }] : [])
  );

  return { body: document, metadata: { ...metadata, headings } };
}

const pages = directory("content/docs");

export default defineConfig({
  collections: {
    docs: {
      // The written pages, plus an API reference index page per tomekit entry point.
      loader: {
        async load(context) {
          const written = await pages.load(context);
          context.watch(apiReferenceWatch);

          return {
            ...written,
            entries: [...written.entries, ...apiReference(context.root).index],
          };
        },
      },
      schema: z.object({
        description: z.string(),
        order: z.number(),
        section: z.enum(sections),
        title: z.string(),
      }),
      transform: withHeadings,
    },
    // One page per tomekit export, linked from the API reference index pages.
    reference: {
      loader: {
        load: ({ root, watch }) => {
          watch(apiReferenceWatch);

          return { entries: apiReference(root).items };
        },
      },
      schema: z.object({
        kind: z.enum([
          "Class",
          "Function",
          "Interface",
          "Type Alias",
          "Variable",
        ]),
        name: z.string(),
      }),
      transform: withHeadings,
    },
  },
});
