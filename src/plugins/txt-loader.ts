import fs from "fs";
import path from "path";

import type { Plugin } from "vite";

export function txtLoaderPlugin(): Plugin {
  return {
    name: "vite-txt-loader",
    enforce: "pre",
    load(id: string) {
      // Skip virtual modules and modules with null bytes
      if (id.startsWith("vite:") || id.startsWith("\0") || id.includes("\x00")) {
        return null;
      }

      const cleanId = id.split("?")[0];

      // Skip if not an absolute path
      if (!path.isAbsolute(cleanId)) {
        return null;
      }

      const extension = path.extname(cleanId).toLowerCase();

      // Handle .txt, .CUBE (LUT), and .3dl (LUT) files as text
      if (extension === ".txt" || extension === ".cube" || extension === ".3dl") {
        const content = fs.readFileSync(cleanId, "utf8");
        // Export as a string literal
        return `export default ${JSON.stringify(content)};`;
      }

      return null;
    }
  };
}
