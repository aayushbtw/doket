import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: true,
    // query.ts is not in package.json exports: the generated module imports dist/query.mjs by path.
    entry: ["src/index.ts", "src/content.ts", "src/query.ts", "src/vite.ts"],
    platform: "node",
  },
});
