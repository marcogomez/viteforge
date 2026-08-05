import type { Plugin } from "vite";

/**
 * Restores Vite's bare query flags behind proxies that re-serialize them.
 *
 * Vite's special import queries (`?raw`, `?url`, `?worker`, `?import`, ...)
 * are valueless flags, and Vite detects them with suffix checks that require
 * the bare form. Next.js dev rewrites (and other proxies that round-trip the
 * query string through a parse/stringify) turn `?import&raw` into
 * `?import=&raw=`, which Vite no longer recognizes — it then serves the raw
 * file as a module and the browser throws a SyntaxError on the first
 * non-JS token.
 *
 * This middleware strips the dangling `=` from empty-valued params before
 * Vite's own middleware sees the URL. Params with real values are left
 * untouched. Dev-server only; builds never see proxied URLs.
 */
export function bareQueryFlagsPlugin(): Plugin {
  return {
    name: "vite-bare-query-flags",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url !== undefined && req.url.includes("=")) {
          req.url = req.url.replace(/([?&][^=&#]+)=(?=&|$)/g, "$1");
        }
        next();
      });
    }
  };
}
