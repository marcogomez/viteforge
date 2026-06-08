import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { base64AssetPlugin } from "../src/plugins/base64-assets";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "base64-test-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

function writeFixture(name: string, content: string | Buffer): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("base64AssetPlugin", () => {
  const plugin = base64AssetPlugin();

  describe("resolveId", () => {
    it("returns null for relative paths with ?base64", () => {
      const result = (plugin.resolveId as Function)("./file.wasm?base64", "/some/importer.ts");
      expect(result).toBeNull();
    });

    it("returns null for absolute paths with ?base64", () => {
      const result = (plugin.resolveId as Function)("/absolute/file.wasm?base64", "/some/importer.ts");
      expect(result).toBeNull();
    });

    it("returns null for imports without ?base64", () => {
      const result = (plugin.resolveId as Function)("some-package", "/some/importer.ts");
      expect(result).toBeNull();
    });

    it("resolves base64: prefix to ?base64 query", () => {
      const fixturePath = writeFixture("resolve-test.wasm", "data");
      const result = (plugin.resolveId as Function)(`base64:${fixturePath}`, "/some/importer.ts");
      expect(result).toMatch(/resolve-test\.wasm\?base64$/);
    });

    it("returns null for base64: prefix with unresolvable path", () => {
      const result = (plugin.resolveId as Function)("base64:nonexistent-package-xyz", "/some/importer.ts");
      expect(result).toBeNull();
    });
  });

  describe("load", () => {
    it("returns null for virtual modules", () => {
      expect((plugin.load as Function)("vite:something")).toBeNull();
      expect((plugin.load as Function)("\0virtual-module")).toBeNull();
    });

    it("returns null for non-absolute paths", () => {
      expect((plugin.load as Function)("relative/path.png")).toBeNull();
    });

    it("returns null for unknown extensions without ?base64", () => {
      const filePath = writeFixture("test.xyz", "data");
      expect((plugin.load as Function)(filePath)).toBeNull();
    });

    it("returns raw base64 for any file with ?base64 query", () => {
      const content = "hello world";
      const filePath = writeFixture("test.wasm", content);
      const result = (plugin.load as Function)(filePath + "?base64");
      const expected = Buffer.from(content).toString("base64");
      expect(result).toBe(`export default "${expected}";`);
    });

    it("returns data URI for .png files", () => {
      const content = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const filePath = writeFixture("image.png", content);
      const result = (plugin.load as Function)(filePath);
      expect(result).toMatch(/^export default "data:image\/png;base64,/);
    });

    it("returns data URI for .glb files", () => {
      const content = Buffer.from("glb-data");
      const filePath = writeFixture("model.glb", content);
      const result = (plugin.load as Function)(filePath);
      expect(result).toMatch(/^export default "data:model\/gltf-binary;base64,/);
    });

    it("returns data URI for .jpg files", () => {
      const content = Buffer.from([0xff, 0xd8, 0xff]);
      const filePath = writeFixture("photo.jpg", content);
      const result = (plugin.load as Function)(filePath);
      expect(result).toMatch(/^export default "data:image\/jpeg;base64,/);
    });

    it("returns data URI for .ttf files", () => {
      const content = Buffer.from("font-data");
      const filePath = writeFixture("font.ttf", content);
      const result = (plugin.load as Function)(filePath);
      expect(result).toMatch(/^export default "data:font\/ttf;base64,/);
    });

    it("returns data URI for .mp3 files", () => {
      const content = Buffer.from("audio-data");
      const filePath = writeFixture("sound.mp3", content);
      const result = (plugin.load as Function)(filePath);
      expect(result).toMatch(/^export default "data:audio\/mpeg;base64,/);
    });

    it("returns data URI for .mp4 files", () => {
      const content = Buffer.from("video-data");
      const filePath = writeFixture("video.mp4", content);
      const result = (plugin.load as Function)(filePath);
      expect(result).toMatch(/^export default "data:video\/mp4;base64,/);
    });

    it("returns optimized URL-encoded SVG (not base64)", () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>';
      const filePath = writeFixture("icon.svg", svg);
      const result = (plugin.load as Function)(filePath);
      expect(result).toMatch(/^export default "data:image\/svg\+xml;charset=utf-8,/);
      expect(result).not.toContain("base64");
    });

    it("strips SVG comments during optimization", () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><!-- comment --><rect width="1" height="1"/></svg>';
      const filePath = writeFixture("commented.svg", svg);
      const result = (plugin.load as Function)(filePath);
      expect(result).not.toContain("comment");
    });

    it("auto-inlines all 15 safe extensions with correct MIME types", () => {
      const cases: [string, string][] = [
        [".glb", "model/gltf-binary"],
        [".gltf", "model/gltf+json"],
        [".fbx", "application/octet-stream"],
        [".obj", "model/obj"],
        [".png", "image/png"],
        [".jpeg", "image/jpeg"],
        [".jpg", "image/jpeg"],
        [".gif", "image/gif"],
        [".webm", "video/webm"],
        [".mp4", "video/mp4"],
        [".mp3", "audio/mpeg"],
        [".ogg", "audio/ogg"],
        [".wav", "audio/wav"],
        [".ttf", "font/ttf"],
        [".otf", "font/otf"]
      ];
      for (const [ext, mime] of cases) {
        const filePath = writeFixture(`file${ext}`, "test-content");
        const result = (plugin.load as Function)(filePath);
        expect(result, `expected data URI with ${mime} for ${ext}`).toContain(`data:${mime};base64,`);
      }
    });

    it("does not auto-inline extensions outside the safe list", () => {
      const excluded = [
        ".json", ".xml", ".csv", ".toml", ".yaml", ".yml",
        ".glsl", ".wgsl", ".vert", ".frag", ".vs", ".fs", ".comp",
        ".wasm", ".bin", ".dat", ".raw", ".img",
        ".cube", ".3dl", ".csp", ".lut",
        ".woff", ".woff2", ".flac", ".aac", ".m4a", ".opus", ".weba",
        ".webp", ".bmp", ".tga", ".hdr", ".exr", ".ktx", ".ktx2",
        ".dds", ".basis", ".ico", ".avif",
        ".stl", ".ply", ".dae", ".3ds", ".usdz",
        ".mov", ".avi", ".mkv"
      ];
      for (const ext of excluded) {
        const filePath = writeFixture(`excluded${ext}`, "content");
        const result = (plugin.load as Function)(filePath);
        expect(result, `${ext} should NOT auto-inline`).toBeNull();
      }
    });

    it("excluded extensions work with explicit ?base64 query", () => {
      const extras = [".wasm", ".json", ".glsl", ".cube", ".woff2"];
      for (const ext of extras) {
        const filePath = writeFixture(`explicit${ext}`, "content");
        const result = (plugin.load as Function)(filePath + "?base64");
        expect(result, `${ext} should work with ?base64`).toMatch(/^export default "/);
        expect(result).not.toContain("data:");
      }
    });

    it("?base64 returns raw base64 string without data URI prefix", () => {
      const content = "raw content for encoding";
      const filePath = writeFixture("raw.bin", content);
      const result = (plugin.load as Function)(filePath + "?base64");
      expect(result).not.toContain("data:");
      expect(result).toMatch(/^export default "[A-Za-z0-9+/]+=*";$/);
    });
  });
});
