/* eslint-disable max-len */
import fs from "fs";
import { createRequire } from "module";
import { deflate } from "pako";
import path from "path";
import { optimize } from "svgo";

import type { Plugin } from "vite";

const require = createRequire(import.meta.url);

export interface PostProcessingPluginOptions {
  /**
   * Whether to enable compression and obfuscation
   * @default true
   */
  enabled?: boolean;
  /**
   * Compression level (1-9, where 9 is maximum compression)
   * @default 9
   */
  compressionLevel?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /**
   * Whether to log compression stats
   * @default true
   */
  logStats?: boolean;
  /**
   * Title for the HTML document
   * @default undefined (no title tag)
   */
  titleString?: string;
  /**
   * SVG string to use as favicon (will be optimized with svgo)
   * @default undefined (no favicon)
   */
  iconString?: string;
  /**
   * Bundle pako inflate runtime instead of using the browser-native DecompressionStream API.
   * Enable this for browsers that don't support DecompressionStream (e.g. Firefox <105, Safari <16.4).
   * @default false
   */
  usePako?: boolean;
}

/**
 * Post-processing plugin that compresses the final HTML bundle.
 *
 * This plugin:
 * 1. Extracts all JavaScript from the final HTML
 * 2. Compresses it using pako (deflate/gzip)
 * 3. Wraps it in a self-extracting HTML with embedded pako inflate
 *
 * The result is a smaller file that's also obfuscated (not human-readable).
 */
export function postProcessingPlugin(options: PostProcessingPluginOptions = {}): Plugin {
  const { enabled = true, compressionLevel = 9, logStats = true, titleString, iconString, usePako = false } = options;

  let outputDir: string;

  return {
    name: "vite-post-processing",
    apply: "build",
    enforce: "post",

    configResolved(config) {
      outputDir = path.resolve(config.root, config.build.outDir);
    },

    closeBundle() {
      if (!enabled) {
        console.log("[post-processing] Plugin disabled, skipping compression");
        return;
      }

      const htmlPath = path.join(outputDir, "index.html");

      if (!fs.existsSync(htmlPath)) {
        console.warn("[post-processing] No index.html found, skipping");
        return;
      }

      const originalHtml = fs.readFileSync(htmlPath, "utf-8");
      const originalSize = Buffer.byteLength(originalHtml, "utf-8");

      // Extract all style content from the HTML
      const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
      const styles: string[] = [];
      let styleMatch;

      while ((styleMatch = styleRegex.exec(originalHtml)) !== null) {
        if (styleMatch[1].trim()) {
          styles.push(styleMatch[1]);
        }
      }

      // Combine all styles into a single minified style block
      const combinedStyles = styles.join("").replace(/\s+/g, " ").trim();

      // Extract all script content from the HTML
      const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
      const scripts: string[] = [];
      let match;

      while ((match = scriptRegex.exec(originalHtml)) !== null) {
        if (match[1].trim()) {
          scripts.push(match[1]);
        }
      }

      if (scripts.length === 0) {
        console.warn("[post-processing] No inline scripts found, skipping");
        return;
      }

      // Combine all scripts
      const combinedScript = scripts.join("\n");
      const scriptSize = Buffer.byteLength(combinedScript, "utf-8");

      // Compress using pako deflate (raw, no gzip header for smaller size)
      const compressed = deflate(combinedScript, {
        level: compressionLevel,
        raw: true
      });

      // Convert to base64
      const compressedBase64 = Buffer.from(compressed).toString("base64");

      const titleTag = titleString ? `<title>${titleString}</title>` : "";

      let faviconTag = "";
      if (iconString) {
        const cleanedSvg = iconString.replace(/<!--[\s\S]*?-->/g, "");
        const optimized = optimize(cleanedSvg, {
          plugins: ["preset-default", "removeComments", "cleanupIds"],
          multipass: true
        });
        const encodedSvg = encodeURIComponent(optimized.data).replace(/'/g, "%27").replace(/"/g, "%22");
        faviconTag = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;charset=utf-8,${encodedSvg}">`;
      }

      const csp = `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline' blob:; worker-src 'self' blob:; object-src 'none';">`;
      const head = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta http-equiv="Cache-Control" content="no-cache">${csp}${titleTag}${faviconTag}<style>${combinedStyles}</style></head>`;
      const decode = `var c="${compressedBase64}";var b=atob(c);var u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);`;

      let bootstrapScripts: string;
      let pakoSize = 0;

      if (usePako) {
        let pakoInflateCode = fs.readFileSync(require.resolve("pako/dist/pako_inflate.min.js"), "utf-8");
        pakoInflateCode = pakoInflateCode.replace(/\/\*![\s\S]*?\*\//g, "");
        pakoSize = Buffer.byteLength(pakoInflateCode, "utf-8");
        bootstrapScripts = `<script>${pakoInflateCode}</script><script>(function(){${decode}try{var d=pako.inflate(u,{to:"string",raw:true});var bl=new Blob([d],{type:"text/javascript"});var s=document.createElement("script");s.type="module";s.src=URL.createObjectURL(bl);document.head.appendChild(s);}catch(e){console.error("Decompression failed:",e);}})();</script>`;
      } else {
        bootstrapScripts = `<script>(async()=>{${decode}var ds=new DecompressionStream("deflate-raw");var w=ds.writable.getWriter();w.write(u);w.close();var d=await new Response(ds.readable).text();var bl=new Blob([d],{type:"text/javascript"});var s=document.createElement("script");s.type="module";s.src=URL.createObjectURL(bl);document.head.appendChild(s);})();</script>`;
      }

      const finalHtml = `${head}<body><div id="app"></div><div id="ui"></div>${bootstrapScripts}</body></html>`.replace(
        /\n/g,
        ""
      );

      fs.writeFileSync(htmlPath, finalHtml, "utf-8");

      const finalSize = Buffer.byteLength(finalHtml, "utf-8");
      const compressedSize = Buffer.byteLength(compressedBase64, "utf-8");

      if (logStats) {
        console.log("\n[post-processing] Compression complete:");
        console.log(`  Original HTML:      ${formatBytes(originalSize)}`);
        console.log(`  Script content:     ${formatBytes(scriptSize)}`);
        console.log(
          `  Compressed blob:    ${formatBytes(compressedSize)} (${((compressedSize / scriptSize) * 100).toFixed(1)}% of script)`
        );
        if (usePako) {
          console.log(`  Pako inflate lib:   ${formatBytes(pakoSize)}`);
        }
        console.log(`  Final HTML:         ${formatBytes(finalSize)}`);
        console.log(
          `  Total savings:      ${formatBytes(originalSize - finalSize)} (${(((originalSize - finalSize) / originalSize) * 100).toFixed(1)}% reduction)`
        );
      }
    }
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
