import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { txtLoaderPlugin } from "../src/plugins/txt-loader";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "txt-loader-test-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

function writeFixture(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("txtLoaderPlugin", () => {
  const plugin = txtLoaderPlugin();

  it("loads .txt files as exported strings", () => {
    const filePath = writeFixture("readme.txt", "Hello, world!");
    const result = (plugin.load as Function)(filePath);
    expect(result).toBe('export default "Hello, world!";');
  });

  it("loads .cube LUT files as exported strings", () => {
    const lutContent = 'TITLE "Test LUT"\nLUT_3D_SIZE 2\n0 0 0\n1 1 1';
    const filePath = writeFixture("color.cube", lutContent);
    const result = (plugin.load as Function)(filePath);
    expect(result).toContain("TITLE");
    expect(result).toContain("LUT_3D_SIZE");
    expect(result).toMatch(/^export default /);
  });

  it("loads .3dl LUT files as exported strings", () => {
    const content = "0 0 0\n1023 1023 1023";
    const filePath = writeFixture("lookup.3dl", content);
    const result = (plugin.load as Function)(filePath);
    expect(result).toMatch(/^export default /);
    expect(result).toContain("1023");
  });

  it("returns null for unsupported extensions", () => {
    const filePath = writeFixture("script.js", "console.log('hi')");
    expect((plugin.load as Function)(filePath)).toBeNull();
  });

  it("returns null for virtual modules", () => {
    expect((plugin.load as Function)("vite:something")).toBeNull();
    expect((plugin.load as Function)("\0virtual")).toBeNull();
  });

  it("returns null for non-absolute paths", () => {
    expect((plugin.load as Function)("relative/file.txt")).toBeNull();
  });

  it("properly JSON-escapes content with special characters", () => {
    const content = 'line1\n"quoted"\ttab\\backslash';
    const filePath = writeFixture("special.txt", content);
    const result = (plugin.load as Function)(filePath);
    const parsed = JSON.parse(result.replace("export default ", "").replace(";", ""));
    expect(parsed).toBe(content);
  });

  it("handles empty files", () => {
    const filePath = writeFixture("empty.txt", "");
    const result = (plugin.load as Function)(filePath);
    expect(result).toBe('export default "";');
  });

  it("strips query parameters from id before checking extension", () => {
    const filePath = writeFixture("data.txt", "content");
    const result = (plugin.load as Function)(filePath + "?import");
    expect(result).toMatch(/^export default /);
  });
});
