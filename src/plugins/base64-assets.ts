import fs from "fs";
import { createRequire } from "module";
import path from "path";
import { optimize } from "svgo";

import type { Plugin } from "vite";

const require = createRequire(import.meta.url);

const MIME_TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".fbx": "application/octet-stream",
  ".obj": "model/obj",
  ".stl": "model/stl",
  ".ply": "application/x-ply",
  ".dae": "model/vnd.collada+xml",
  ".3ds": "application/x-3ds",
  ".usdz": "model/vnd.usdz+zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tga": "image/x-tga",
  ".hdr": "image/vnd.radiance",
  ".exr": "image/x-exr",
  ".ktx": "image/ktx",
  ".ktx2": "image/ktx2",
  ".dds": "image/vnd-ms.dds",
  ".basis": "application/octet-stream",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "audio/ogg",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".m4a": "audio/mp4",
  ".opus": "audio/opus",
  ".weba": "audio/webm",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
  ".img": "application/octet-stream",
  ".dat": "application/octet-stream",
  ".raw": "application/octet-stream"
};

// only these extensions auto-inline on import (no ?base64 needed).
// this is the explicit safe list. everything else requires ?base64.
const AUTO_INLINE = new Set([
  ".glb", ".gltf", ".fbx", ".obj",
  ".png", ".jpeg", ".jpg",
  ".gif", ".webm", ".mp4", ".mp3",
  ".ogg", ".wav", ".ttf", ".otf"
]);

function lookupMime(ext: string): string {
  return MIME_TYPES[ext.toLowerCase()] || "application/octet-stream";
}

export function base64AssetPlugin(): Plugin {
  return {
    name: "vite-base64-assets",
    enforce: "pre",
    resolveId(source: string, importer: string | undefined) {
      if (source.startsWith("base64:")) {
        const cleanSource = source.slice(7);
        try {
          const resolved = require.resolve(cleanSource, {
            paths: importer ? [path.dirname(importer)] : undefined
          });
          return resolved + "?base64";
        } catch {
          return null;
        }
      }

      if (source.includes("?base64") && !source.startsWith(".") && !path.isAbsolute(source)) {
        const cleanSource = source.split("?")[0];
        try {
          const resolved = require.resolve(cleanSource, {
            paths: importer ? [path.dirname(importer)] : undefined
          });
          return resolved + "?base64";
        } catch {
          return null;
        }
      }
      return null;
    },
    load(id: string) {
      if (id.startsWith("vite:") || id.startsWith("\0") || id.includes("\x00")) {
        return null;
      }

      const hasBase64Query = id.includes("?base64");
      const cleanId = id.split("?")[0];

      if (!path.isAbsolute(cleanId)) {
        return null;
      }

      const extension = path.extname(cleanId).toLowerCase();

      // ?base64 query works with any file type and returns raw base64
      if (hasBase64Query) {
        const fileBuffer = fs.readFileSync(cleanId);
        return `export default "${fileBuffer.toString("base64")}";`;
      }

      // SVGs get optimized and URL-encoded (smaller than base64 for SVG)
      if (extension === ".svg") {
        const svg = fs.readFileSync(cleanId, "utf8");
        const optimized = optimize(svg, {
          plugins: ["preset-default", "removeComments", "cleanupIds"],
          multipass: true
        });
        const encoded = encodeURIComponent(optimized.data).replace(/'/g, "%27").replace(/"/g, "%22");
        return `export default "data:image/svg+xml;charset=utf-8,${encoded}"`;
      }

      if (AUTO_INLINE.has(extension)) {
        const mimeType = lookupMime(extension);
        const fileBuffer = fs.readFileSync(cleanId);
        return `export default "data:${mimeType};base64,${fileBuffer.toString("base64")}"`;
      }

      return null;
    }
  };
}
