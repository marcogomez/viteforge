import fs from "fs";

import type { Plugin } from "vite";

/**
 * Vite plugin to handle loading a file as text from a virtual module.
 *
 * Usage:
 * ```ts
 * // In vite.config.ts
 * textFilePlugin("my-virtual-module", "./path/to/file.js")
 *
 * // In code
 * import fileContent from "my-virtual-module";
 * ```
 *
 * Used by mml-networked-dom-web-runner for embedding iframe JS.
 */
export function textFilePlugin(virtualModuleId: string, filePath: string): Plugin {
  const resolvedVirtualModuleId = "\0" + virtualModuleId;

  return {
    name: `vite-text-file-${virtualModuleId}`,
    enforce: "pre",
    resolveId(source) {
      if (source === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
      return null;
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        const content = fs.readFileSync(filePath, "utf8");
        return `export default ${JSON.stringify(content)};`;
      }
      return null;
    }
  };
}
