import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { calculateBuiltSizePlugin } from "../src/plugins/calculate-built-size";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "calc-size-test-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
  vi.restoreAllMocks();
});

describe("calculateBuiltSizePlugin", () => {
  it("has the correct plugin name", () => {
    const plugin = calculateBuiltSizePlugin();
    expect(plugin.name).toBe("calculate-built-size");
  });

  it("only applies to build", () => {
    const plugin = calculateBuiltSizePlugin();
    expect(plugin.apply).toBe("build");
  });

  it("reports total size of all files in the output directory", () => {
    fs.writeFileSync(path.join(tmpDir, "index.js"), "a".repeat(1000));
    fs.writeFileSync(path.join(tmpDir, "style.css"), "b".repeat(500));

    const plugin = calculateBuiltSizePlugin({ outputDir: tmpDir });
    (plugin.closeBundle as Function)();

    expect(console.log).toHaveBeenCalledWith("Total built size: 1500 bytes");
  });

  it("includes files in subdirectories", () => {
    const subDir = path.join(tmpDir, "assets");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(tmpDir, "index.js"), "a".repeat(100));
    fs.writeFileSync(path.join(subDir, "image.png"), "b".repeat(200));

    const plugin = calculateBuiltSizePlugin({ outputDir: tmpDir });
    (plugin.closeBundle as Function)();

    expect(console.log).toHaveBeenCalledWith("Total built size: 300 bytes");
  });

  it("reports SI size (powers of 1000)", () => {
    fs.writeFileSync(path.join(tmpDir, "bundle.js"), "x".repeat(150000));

    const plugin = calculateBuiltSizePlugin({ outputDir: tmpDir });
    (plugin.closeBundle as Function)();

    const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat();
    const siCall = calls.find((c: string) => typeof c === "string" && c.startsWith("SI size"));
    expect(siCall).toMatch(/kB/);
  });

  it("reports IEC size (powers of 1024)", () => {
    fs.writeFileSync(path.join(tmpDir, "bundle.js"), "x".repeat(150000));

    const plugin = calculateBuiltSizePlugin({ outputDir: tmpDir });
    (plugin.closeBundle as Function)();

    const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat();
    const iecCall = calls.find((c: string) => typeof c === "string" && c.startsWith("IEC size"));
    expect(iecCall).toMatch(/KiB/);
  });

  it("does nothing when output directory does not exist", () => {
    const plugin = calculateBuiltSizePlugin({ outputDir: path.join(tmpDir, "nonexistent") });
    expect(() => (plugin.closeBundle as Function)()).not.toThrow();
    expect(console.log).not.toHaveBeenCalled();
  });

  it("handles empty directories", () => {
    const plugin = calculateBuiltSizePlugin({ outputDir: tmpDir });
    (plugin.closeBundle as Function)();

    expect(console.log).toHaveBeenCalledWith("Total built size: 0 bytes");
  });
});
