import stylex from "@stylexjs/unplugin/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

const config = defineConfig({
  plugins: lazyPlugins(async () => {
    // Imported lazily: `vp run` reads this config before tomekit's dist is built.
    const { tomekit } = await import("tomekit/vite");

    return [
      tomekit(),
      tanstackStart({ prerender: { crawlLinks: true, enabled: true } }),
      // Before the React plugin, or Fast Refresh breaks.
      stylex({ useCSSLayers: true }),
      viteReact(),
    ];
  }),
  resolve: { tsconfigPaths: true },
});

export default config;
