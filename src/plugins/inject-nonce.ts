/* eslint-disable max-len */
import crypto from "crypto";

import type { Plugin } from "vite";

export interface InjectNoncePluginOptions {
  isDevMode?: boolean;
}

export function injectNoncePlugin(options: InjectNoncePluginOptions = {}): Plugin {
  const { isDevMode = false } = options;
  const nonce = crypto.randomBytes(16).toString("base64");

  return {
    name: "vite-inject-nonce",
    enforce: "post",
    transformIndexHtml(html) {
      const metaTagRegex = /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i;

      if (metaTagRegex.test(html)) {
        const metaStrStart = `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-eval' blob:`;
        const metaStrNonce = `'nonce-${nonce}';`;
        const metaStrWorker = `worker-src 'self' blob:;`;
        const metaStrEnd = `object-src 'none';">`;
        html = html.replace(metaTagRegex, `${metaStrStart} ${metaStrNonce} ${metaStrWorker} ${metaStrEnd}`);
      } else {
        console.error("CSP meta tag not found in the HTML!");
      }

      html = html.replace(/<script([^>]*)>/g, (_match, p1) => `<script${p1} nonce="${nonce}">`);

      if (isDevMode) {
        console.log("Running in dev/test mode, removing CSP meta tag.");
        html = html.replace(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/gi, "");
      }

      return html;
    }
  };
}
