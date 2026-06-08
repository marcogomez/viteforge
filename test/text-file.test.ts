import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { textFilePlugin } from "../src/plugins/text-file";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "text-file-test-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe("textFilePlugin", () => {
  it("resolves the virtual module id", () => {
    const plugin = textFilePlugin("my-module", "/some/file.js");
    const result = (plugin.resolveId as Function)("my-module");
    expect(result).toBe("\0my-module");
  });

  it("returns null for non-matching module ids", () => {
    const plugin = textFilePlugin("my-module", "/some/file.js");
    expect((plugin.resolveId as Function)("other-module")).toBeNull();
  });

  it("loads the file content as a JSON-escaped string export", () => {
    const content = 'const x = "hello";\nconsole.log(x);';
    const filePath = path.join(tmpDir, "code.js");
    fs.writeFileSync(filePath, content);

    const plugin = textFilePlugin("code-module", filePath);
    const result = (plugin.load as Function)("\0code-module");
    expect(result).toMatch(/^export default /);
    expect(result).toMatch(/;$/);
    const jsonPart = result.slice("export default ".length, -1);
    expect(JSON.parse(jsonPart)).toBe(content);
  });

  it("returns null when loading a non-matching id", () => {
    const plugin = textFilePlugin("my-module", "/some/file.js");
    expect((plugin.load as Function)("\0other-module")).toBeNull();
    expect((plugin.load as Function)("my-module")).toBeNull();
  });

  it("uses unique plugin name per virtual module", () => {
    const plugin1 = textFilePlugin("module-a", "/a.js");
    const plugin2 = textFilePlugin("module-b", "/b.js");
    expect(plugin1.name).toBe("vite-text-file-module-a");
    expect(plugin2.name).toBe("vite-text-file-module-b");
    expect(plugin1.name).not.toBe(plugin2.name);
  });

  it("handles files with special characters", () => {
    const content = 'alert("hello\\nworld");\t// tab\n';
    const filePath = path.join(tmpDir, "special.js");
    fs.writeFileSync(filePath, content);

    const plugin = textFilePlugin("special-module", filePath);
    const result = (plugin.load as Function)("\0special-module");
    const jsonPart = result.slice("export default ".length, -1);
    expect(JSON.parse(jsonPart)).toBe(content);
  });
});
