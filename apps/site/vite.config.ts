import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { tomekit } from "tomekit/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

const config = defineConfig({
  plugins: lazyPlugins(() => [
    tomekit(),
    tailwindcss(),
    tanstackStart({ prerender: { crawlLinks: true, enabled: true } }),
    viteReact(),
  ]),
  resolve: { tsconfigPaths: true },
});

export default config;
