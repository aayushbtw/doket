import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

const config = defineConfig({
  plugins: lazyPlugins(() => [tanstackStart(), viteReact()]),
  resolve: { tsconfigPaths: true },
});

export default config;
