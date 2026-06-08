import { describe, it, expect } from "vitest";
import { minifyShader } from "../src/plugins/glsl/load-shader";

describe("minifyShader", () => {
  it("strips single-line comments", () => {
    const input = "void main() {\n  // this is a comment\n  gl_FragColor = vec4(1.0);\n}";
    const result = minifyShader(input);
    expect(result).not.toContain("// this is a comment");
    expect(result).toContain("gl_FragColor");
  });

  it("strips multi-line comments", () => {
    const input = "/* block comment */\nvoid main() {\n  gl_FragColor = vec4(1.0);\n}";
    const result = minifyShader(input);
    expect(result).not.toContain("block comment");
    expect(result).toContain("gl_FragColor");
  });

  it("removes excess whitespace", () => {
    const input = "void main()  {\n    float x  =  1.0 ;\n}";
    const result = minifyShader(input);
    expect(result).not.toContain("  ");
  });

  it("removes empty lines", () => {
    const input = "void main() {\n\n\n  float x = 1.0;\n\n}";
    const result = minifyShader(input);
    expect(result).not.toMatch(/\n{2,}/);
  });

  it("preserves preprocessor directives on their own lines", () => {
    const input = "#version 300 es\nvoid main() {\n  gl_FragColor = vec4(1.0);\n}";
    const result = minifyShader(input);
    expect(result).toMatch(/#version 300 es\n/);
  });

  it("keeps multiple preprocessor directives each on their own line", () => {
    const input = "#version 300 es\n#define FOO 1\nvoid main() {}";
    const result = minifyShader(input);
    const lines = result.split("\n").filter((l) => l.length > 0);
    expect(lines[0]).toBe("#version 300 es");
    expect(lines[1]).toBe("#define FOO 1");
  });

  it("preserves WGSL @vertex keyword with trailing space", () => {
    const input = "@vertex\nfn vs_main() -> vec4<f32> {\n  return vec4(0.0);\n}";
    const result = minifyShader(input);
    expect(result).toMatch(/@vertex /);
  });

  it("preserves WGSL @fragment keyword with trailing space", () => {
    const input = "@fragment\nfn fs_main() -> vec4<f32> {\n  return vec4(1.0);\n}";
    const result = minifyShader(input);
    expect(result).toMatch(/@fragment /);
  });

  it("preserves WGSL @compute keyword with trailing space", () => {
    const input = "@compute\nfn cs_main() {\n  var x = 1;\n}";
    const result = minifyShader(input);
    expect(result).toMatch(/@compute /);
  });

  it("handles an empty string", () => {
    expect(minifyShader("")).toBe("");
  });

  it("handles line continuations with backslash", () => {
    const input = "#define FOO \\\n  bar\nvoid main() {}";
    const result = minifyShader(input);
    expect(result).not.toContain("\\");
  });
});
