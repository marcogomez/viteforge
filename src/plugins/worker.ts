import { type Rollup, build } from "vite";

import type { Plugin } from "vite";

/**
 * Vite plugin that handles .worker imports similar to the esbuild workerPlugin.
 * Compiles worker files as separate bundles and exports a blob URL.
 */
export function workerPlugin(): Plugin {
  return {
    name: "vite-worker-plugin",
    enforce: "pre",

    async resolveId(source, importer) {
      if (source.endsWith(".worker")) {
        const resolved = await this.resolve(source + ".ts", importer, { skipSelf: true });
        if (resolved) {
          return {
            id: resolved.id + "?worker-plugin",
            meta: { workerPlugin: true }
          };
        }
      }
      return null;
    },

    async load(id) {
      if (!id.endsWith("?worker-plugin")) {
        return null;
      }

      const workerPath = id.replace("?worker-plugin", "");

      // Build the worker as a separate bundle
      const result = await build({
        configFile: false,
        logLevel: "silent",
        build: {
          write: false,
          minify: true,
          target: "es2022",
          lib: {
            entry: workerPath,
            formats: ["iife"],
            name: "worker"
          },
          rollupOptions: {
            output: {
              inlineDynamicImports: true
            }
          }
        }
      });

      // Get the compiled code
      const output = Array.isArray(result) ? result[0] : result;

      // Type guard: ensure it's a RollupOutput, not a RollupWatcher
      if (!("output" in output)) {
        throw new Error(`Failed to build worker: ${workerPath} - unexpected result type`);
      }

      const rollupOutput = output as Rollup.RollupOutput;
      const chunk = rollupOutput.output.find((o: Rollup.OutputAsset | Rollup.OutputChunk) => o.type === "chunk");
      if (!chunk || chunk.type !== "chunk") {
        throw new Error(`Failed to build worker: ${workerPath}`);
      }

      const workerCode = chunk.code;

      // Return code that creates a blob URL
      return `
const workerCode = ${JSON.stringify(workerCode)};
const blob = new Blob([workerCode], { type: 'application/javascript' });
export default URL.createObjectURL(blob);
`;
    }
  };
}
