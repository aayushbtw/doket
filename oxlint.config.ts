import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  rules: {
    "func-style": ["error", "declaration", { allowArrowFunctions: false }],
    "no-use-before-define": ["error", { functions: false }],
  },
});
