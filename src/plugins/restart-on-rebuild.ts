import { type ChildProcess, spawn } from "child_process";
import kill from "tree-kill";

import type { Plugin } from "vite";

let runningProcess: ChildProcess | undefined;

export interface RestartOnRebuildPluginOptions {
  /**
   * The command to run after each build completes.
   * This is typically used to start a server process.
   * @example "pnpm run dev:start" or "node ./build/index.js"
   */
  startCommand: string;
  /**
   * Delay in milliseconds before starting the process after build completes.
   * Useful to ensure all files are written before starting.
   * @default 100
   */
  delay?: number;
}

/**
 * A Vite plugin that restarts a process after each build.
 * Useful for Node.js server development where you want the server
 * to restart automatically when source files change.
 *
 * Use with `vite build --watch` for development.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { restartOnRebuildPlugin } from "build-utils-vite/plugins";
 *
 * export default defineConfig({
 *   plugins: [
 *     restartOnRebuildPlugin({ startCommand: "node ./build/index.js" })
 *   ]
 * });
 * ```
 */
export function restartOnRebuildPlugin(options: RestartOnRebuildPluginOptions): Plugin {
  const { startCommand, delay = 100 } = options;

  return {
    name: "restart-on-rebuild",
    apply: "build",

    async closeBundle() {
      console.log("Build finished. (Re)starting process...");

      // Kill existing process if running
      if (runningProcess?.pid) {
        await new Promise<void>((resolve) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          kill(runningProcess!.pid!, "SIGTERM", (err) => {
            if (err) {
              console.error("Error killing process:", err);
            }
            resolve();
          });
        });
        runningProcess = undefined;
      }

      // Small delay to ensure files are fully written
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // Start the new process
      runningProcess = spawn(startCommand, {
        stdio: "inherit",
        shell: true
      });

      runningProcess.on("error", (err) => {
        console.error(`Failed to start process: ${err.message}`);
      });

      runningProcess.on("exit", (code, signal) => {
        if (signal !== "SIGTERM" && code !== 0) {
          console.log(`Process exited with code ${code}`);
        }
      });
    }
  };
}
