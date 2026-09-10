/* eslint-disable max-len */
import fs from "fs";
import { createRequire } from "module";
import { deflate } from "pako";
import path from "path";
import { optimize } from "svgo";

import { generateSocialTags, processScreenshot } from "./social-card.js";

import type { SocialCardImage, SocialOptions } from "./social-card.js";
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
  /**
   * Social card metadata. When set, Open Graph and Twitter tags are injected
   * into the built HTML. When a screenshot exists at the app root it is
   * resized and compressed into a sidecar card image next to index.html,
   * because scrapers require the og:image to be a fetchable URL and reject
   * inlined data URIs.
   * @default undefined (no social tags)
   */
  social?: SocialOptions;
  /**
   * The ownership notice, the copyright and terms text that ships inside
   * the built file. It is written twice, as an HTML comment right before
   * the bootstrap script, where anyone fetching the page reads it first,
   * and as a `/*! ... *\/` block at the top of the compressed module, so
   * it travels with the code when someone extracts it. A string is the
   * text itself, `{ file }` is a path relative to the app root. When unset,
   * a `NOTICE.txt` at the app root is used if one exists.
   * @default undefined (NOTICE.txt at the app root when present)
   */
  notice?: string | { file: string };
}

/** the file the notice is read from when the option names none */
const DEFAULT_NOTICE_FILE = "NOTICE.txt";

/**
 * Resolve the notice text, from the option or from the default file.
 * Returns null when there is none, and warns when a named file is missing.
 */
function resolveNotice(rootDir: string, notice: string | { file: string } | undefined): string | null {
  let text: string | null = null;
  if (typeof notice === "string") {
    text = notice;
  } else {
    const file = notice?.file ?? DEFAULT_NOTICE_FILE;
    const noticePath = path.resolve(rootDir, file);
    if (fs.existsSync(noticePath)) {
      text = fs.readFileSync(noticePath, "utf-8");
    } else if (notice !== undefined) {
      console.warn(`[post-processing] Notice file ${file} not found at the app root, no notice will ship`);
    }
  }
  if (text === null) {
    return null;
  }
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** the notice as a block comment, with any comment terminator inside it disarmed */
function noticeAsScriptComment(text: string): string {
  return `/*!\n${text.replace(/\*\//g, "* /")}\n*/\n`;
}

/** the notice as an HTML comment, with any double dash inside it disarmed, since HTML forbids them */
function noticeAsHtmlComment(text: string): string {
  return `<!--\n${text.replace(/--/g, "- -")}\n-->`;
}

/**
 * Post-processing plugin that compresses the final HTML bundle.
 *
 * This plugin:
 * 1. Extracts all JavaScript from the final HTML
 * 2. Puts the ownership notice, when there is one, at the top of it
 * 3. Compresses it using pako (deflate/gzip)
 * 4. Wraps it in a self-extracting HTML with embedded pako inflate, the
 *    notice repeated as an HTML comment before the bootstrap script
 *
 * The result is a smaller file that's also obfuscated (not human-readable).
 */
export function postProcessingPlugin(options: PostProcessingPluginOptions = {}): Plugin {
  const {
    enabled = true,
    compressionLevel = 9,
    logStats = true,
    titleString,
    iconString,
    usePako = false,
    social,
    notice
  } = options;

  let outputDir: string;
  let rootDir: string;

  return {
    name: "vite-post-processing",
    apply: "build",
    enforce: "post",

    configResolved(config) {
      rootDir = config.root;
      outputDir = path.resolve(config.root, config.build.outDir);
    },

    async closeBundle() {
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

      // Combine all scripts, the notice at the top when there is one
      const noticeText = resolveNotice(rootDir, notice);
      const combinedScript = (noticeText === null ? "" : noticeAsScriptComment(noticeText)) + scripts.join("\n");
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

      const screenshotSource = social?.screenshot?.source ?? "screenshot.png";
      const screenshotPath = path.resolve(rootDir, screenshotSource);
      let socialTags = "";
      if (social !== undefined) {
        let cardImage: SocialCardImage | undefined;
        if (fs.existsSync(screenshotPath)) {
          cardImage = await processScreenshot(screenshotPath, outputDir, social.screenshot);
          if (logStats) {
            console.log(
              `[post-processing] Social card: ${cardImage.fileName} (${cardImage.width}x${cardImage.height}, ${formatBytes(cardImage.bytes)})`
            );
          }
        } else {
          console.warn(
            `[post-processing] No ${screenshotSource} found at the app root, social tags will carry no image`
          );
        }
        socialTags = generateSocialTags(titleString, social, cardImage);
      } else if (fs.existsSync(screenshotPath)) {
        console.warn(
          "[post-processing] Found screenshot.png but no social options, skipping card generation. " +
            "Set the social option to generate share tags and the card image."
        );
      }

      // wasm-unsafe-eval permits WebAssembly.instantiate from bytes (embedded
      // decoders like draco and basis) without allowing JS eval
      const csp = `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; object-src 'none';">`;
      const head = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta http-equiv="Cache-Control" content="no-cache">${csp}${titleTag}${faviconTag}${socialTags}<style>${combinedStyles}</style></head>`;
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

      // the newlines go, except inside the notice, which keeps its lines
      const opening = `${head}<body><div id="app"></div><div id="ui"></div>`.replace(/\n/g, "");
      const closing = `${bootstrapScripts}</body></html>`.replace(/\n/g, "");
      const noticeTag = noticeText === null ? "" : noticeAsHtmlComment(noticeText);
      const finalHtml = `${opening}${noticeTag}${closing}`;

      fs.writeFileSync(htmlPath, finalHtml, "utf-8");

      const finalSize = Buffer.byteLength(finalHtml, "utf-8");
      const compressedSize = Buffer.byteLength(compressedBase64, "utf-8");

      if (logStats && noticeText !== null) {
        const noticeSize = formatBytes(Buffer.byteLength(noticeText, "utf-8"));
        console.log(`[post-processing] Notice: ${noticeSize} in the html and the script`);
      }

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
