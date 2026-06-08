import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "plugins/index": "src/plugins/index.ts"
  },
  format: ["cjs", "esm"],
  dts: false,
  sourcemap: false,
  clean: false,
  splitting: false,
  treeshake: true,
  outDir: "dist",
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".mjs"
    };
  },
  external: [
    "vite",
    "vite-plugin-dts",
    "vite-plugin-glsl",
    "vite-plugin-html",
    "vite-plugin-singlefile",
    "svgo"
  ]
});
