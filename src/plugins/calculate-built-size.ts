import fs from "fs";
import path from "path";

import type { Plugin } from "vite";

export interface CalculateBuiltSizePluginOptions {
  outputDir?: string;
}

export function calculateBuiltSizePlugin(options: CalculateBuiltSizePluginOptions = {}): Plugin {
  const bytesToHumanReadable = (bytes: number, si = false, decimalPoints = 3) => {
    // SI units are powers of 1000, binary units (IEC) are powers of 1024
    const threshold = si ? 1000 : 1024;

    if (Math.abs(bytes) < threshold) {
      return bytes + " Bytes";
    }

    const siUnits = ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const iecUnits = ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];

    const units = si ? siUnits : iecUnits;
    let u = -1;
    const r = 10 ** decimalPoints;

    do {
      bytes /= threshold;
      ++u;
    } while (Math.round(Math.abs(bytes) * r) / r >= threshold && u < units.length - 1);

    return bytes.toFixed(decimalPoints) + " " + units[u];
  };

  return {
    name: "calculate-built-size",
    apply: "build",
    closeBundle() {
      const directory = options.outputDir || path.resolve(process.cwd(), "dist");

      if (!fs.existsSync(directory)) {
        return;
      }

      let totalSize = 0;

      function calculateSize(dir: string) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            calculateSize(fullPath);
          } else if (entry.isFile()) {
            const stats = fs.statSync(fullPath);
            totalSize += stats.size;
          }
        });
      }

      calculateSize(directory);
      console.log(`Total built size: ${totalSize} bytes`);
      console.log(`SI size  : ${bytesToHumanReadable(totalSize, true)}`);
      console.log(`IEC size : ${bytesToHumanReadable(totalSize, false)}`);
    }
  };
}
