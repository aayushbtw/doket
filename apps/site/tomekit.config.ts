import { defineConfig } from "tomekit";
import { z } from "zod";

export default defineConfig({
  collections: {
    docs: {
      directory: "content/docs",
      schema: z.object({
        description: z.string(),
        title: z.string(),
      }),
    },
  },
});
