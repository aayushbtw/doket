import ultracite from "ultracite/oxfmt";
import core from "ultracite/oxlint/core";
import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: ultracite,
  lint: {
    ...core,
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    options: { typeAware: true, typeCheck: true },
    rules: {
      ...core.rules,
      "func-style": ["error", "declaration", { allowArrowFunctions: false }],
      "no-use-before-define": ["error", { functions: false }],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
  },
  pack: {
    dts: true,
    entry: ["src/index.ts", "src/vite.ts"],
    platform: "node",
  },
});
