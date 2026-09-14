import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

const config = defineConfig({
  plugins: lazyPlugins(async () => {
    // Imported lazily: `vp run` reads this config before tomekit's dist is built.
    const { tomekit } = await import("tomekit/vite");

    return [
      tomekit(),
      tailwindcss(),
      tanstackStart({ prerender: { crawlLinks: true, enabled: true } }),
      viteReact(),
    ];
  }),
  resolve: { tsconfigPaths: true },
});

export default config;
