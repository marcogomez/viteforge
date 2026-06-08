export { minifyShader as minify } from "./load-shader";
import { emitWarning } from "process";

import loadShader from "./load-shader";

import type { PluginOptions } from "./types";
import type { Plugin } from "vite";

export default async function glsl({
  include = ["**/*.glsl", "**/*.wgsl", "**/*.vert", "**/*.frag", "**/*.vs", "**/*.fs"],
  exclude = undefined,
  defaultExtension = "glsl",
  warnDuplicatedImports = true,
  removeDuplicatedImports = false,
  importKeywords = ["#include"],
  onComplete = undefined,
  minify = false,
  watch = true,
  root = "/"
}: PluginOptions = {}): Promise<Plugin> {
  const prod = process.env.NODE_ENV === "production";

  const Vite = await import("vite");
  const viteExports = Vite as Record<string, unknown>;
  const transformWithOxc = viteExports.transformWithOxc as
    | ((code: string, id: string, opts: { sourcemap: boolean }) => Promise<{ code: string; map: string | null }>)
    | undefined;
  const transformWithEsbuild = viteExports.transformWithEsbuild as
    | typeof import("vite").transformWithEsbuild
    | undefined;

  const oxc = typeof transformWithOxc === "function";
  const esbuild = typeof transformWithEsbuild === "function";

  if (esbuild && !oxc) {
    try {
      await import("esbuild");
    } catch {
      emitWarning("'esbuild' was not found.", {
        code: "vite-plugin-glsl",
        detail: "Please install it as a dev dependency if your vite version does not use rolldown."
      });
    }
  }

  let sourcemap = false;

  return {
    enforce: "pre",
    name: "vite-plugin-glsl",

    configResolved(resolvedConfig) {
      sourcemap = !!resolvedConfig.build.sourcemap;
    },

    transform: {
      filter: { id: { include, exclude } },

      async handler(source, shader) {
        const { dependentChunks, outputShader } = await loadShader(source, shader, {
          removeDuplicatedImports,
          warnDuplicatedImports,
          defaultExtension,
          importKeywords,
          onComplete,
          minify,
          root
        });

        if (watch && !prod) {
          Array.from(dependentChunks.values())
            .flat()
            .forEach((chunk) => this.addWatchFile(chunk));
        }

        if (oxc) {
          return await transformWithOxc(`export default \`${outputShader}\``, shader, { sourcemap });
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return await transformWithEsbuild!(outputShader, shader, {
          sourcemap: sourcemap && "external",
          loader: "text",
          format: "esm",
          minifyWhitespace: prod
        });
      }
    }
  };
}
