import { describe, it, expect } from "vitest";
import {
  defineViteConfig,
  defineAppConfig,
  definePackageConfig,
  defineLibraryConfig,
  terserOptions
} from "../src/index";

import type { ConfigEnv } from "vite";

const buildEnv: ConfigEnv = { command: "build", mode: "production" };
const serveEnv: ConfigEnv = { command: "serve", mode: "development" };

describe("terserOptions", () => {
  it("drops console and debugger", () => {
    expect(terserOptions.compress.drop_console).toBe(true);
    expect(terserOptions.compress.drop_debugger).toBe(true);
  });

  it("strips all comments", () => {
    expect(terserOptions.format.comments).toBe(false);
  });

  it("mangles toplevel with 2 passes", () => {
    expect(terserOptions.mangle.toplevel).toBe(true);
    expect(terserOptions.compress.passes).toBe(2);
  });
});

describe("defineViteConfig", () => {
  it("returns a function that accepts ConfigEnv", () => {
    const configFn = defineViteConfig();
    expect(typeof configFn).toBe("function");
    const config = configFn(buildEnv);
    expect(config).toBeDefined();
  });

  it("uses default port 4173 and preview port 4174", () => {
    const config = defineViteConfig()(serveEnv);
    expect(config.server?.port).toBe(4173);
    expect(config.preview?.port).toBe(4174);
  });

  it("respects custom ports", () => {
    const config = defineViteConfig({ port: 9000, previewPort: 9001 })(serveEnv);
    expect(config.server?.port).toBe(9000);
    expect(config.preview?.port).toBe(9001);
  });

  it("defaults outDir to ./dist", () => {
    const config = defineViteConfig()(buildEnv);
    expect(config.build?.outDir).toBe("./dist");
  });

  it("respects custom outDir", () => {
    const config = defineViteConfig({ outDir: "./dist" })(buildEnv);
    expect(config.build?.outDir).toBe("./dist");
  });

  it("defaults minify to terser", () => {
    const config = defineViteConfig()(buildEnv);
    expect(config.build?.minify).toBe("terser");
  });

  it("respects custom minify setting", () => {
    const config = defineViteConfig({ minify: "esbuild" })(buildEnv);
    expect(config.build?.minify).toBe("esbuild");
  });

  it("excludes fsevents and lightningcss from optimizeDeps", () => {
    const config = defineViteConfig()(buildEnv);
    expect(config.optimizeDeps?.exclude).toContain("fsevents");
    expect(config.optimizeDeps?.exclude).toContain("lightningcss");
  });

  it("forces optimizeDeps rebuild in dev mode", () => {
    const config = defineViteConfig()(serveEnv);
    expect(config.optimizeDeps?.force).toBe(true);
  });

  it("does not force optimizeDeps in build mode", () => {
    const config = defineViteConfig()(buildEnv);
    expect(config.optimizeDeps?.force).toBe(false);
  });

  it("disables optimizeDeps entry discovery in dev mode", () => {
    const config = defineViteConfig()(serveEnv);
    expect(config.optimizeDeps?.entries).toEqual([]);
  });

  it("does not set entries in build mode", () => {
    const config = defineViteConfig()(buildEnv);
    expect(config.optimizeDeps?.entries).toBeUndefined();
  });

  it("includes common 3D and media asset extensions", () => {
    const config = defineViteConfig()(buildEnv);
    const assets = config.assetsInclude as string[];
    expect(assets).toContain("**/*.glb");
    expect(assets).toContain("**/*.wasm");
    expect(assets).toContain("**/*.png");
    expect(assets).toContain("**/*.mp3");
    expect(assets).toContain("**/*.ttf");
  });

  it("enables single file output in build mode by default", () => {
    const config = defineViteConfig()(buildEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).toContain("vite:singlefile");
  });

  it("disables single file output in dev mode by default", () => {
    const config = defineViteConfig()(serveEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).not.toContain("vite:singlefile");
  });

  it("respects explicit singleFile override", () => {
    const config = defineViteConfig({ singleFile: false })(buildEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).not.toContain("vite:singlefile");
  });

  it("always includes txt loader plugin", () => {
    const config = defineViteConfig()(serveEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).toContain("vite-txt-loader");
  });

  it("includes base64 asset plugin by default", () => {
    const config = defineViteConfig()(buildEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).toContain("vite-base64-assets");
  });

  it("excludes base64 asset plugin when disabled", () => {
    const config = defineViteConfig({ useBase64Assets: false })(buildEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).not.toContain("vite-base64-assets");
  });

  it("includes nonce injection plugin by default", () => {
    const config = defineViteConfig()(buildEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).toContain("vite-inject-nonce");
  });

  it("excludes nonce injection plugin when disabled", () => {
    const config = defineViteConfig({ useNonceInjection: false })(buildEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).not.toContain("vite-inject-nonce");
  });

  it("includes calculate-built-size plugin in build mode by default", () => {
    const config = defineViteConfig()(buildEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).toContain("calculate-built-size");
  });

  it("excludes calculate-built-size plugin in dev mode", () => {
    const config = defineViteConfig()(serveEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).not.toContain("calculate-built-size");
  });

  it("appends additionalPlugins", () => {
    const customPlugin = { name: "custom-test-plugin" };
    const config = defineViteConfig({ additionalPlugins: [customPlugin] })(buildEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).toContain("custom-test-plugin");
  });

  it("sets css modules to camelCaseOnly", () => {
    const config = defineViteConfig()(buildEnv);
    expect((config.css?.modules as Record<string, unknown>)?.localsConvention).toBe("camelCaseOnly");
  });

  it("inlines all assets via high assetsInlineLimit", () => {
    const config = defineViteConfig()(buildEnv);
    expect(config.build?.assetsInlineLimit).toBe(900000000);
  });

  it("disables css code split", () => {
    const config = defineViteConfig()(buildEnv);
    expect(config.build?.cssCodeSplit).toBe(false);
  });

  it("externalizes fsevents in rollup", () => {
    const config = defineViteConfig()(buildEnv);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((config.build?.rollupOptions as any)?.external).toContain("fsevents");
  });
});

describe("defineAppConfig", () => {
  it("enables base64 assets, nonce injection, and built size by default", () => {
    const config = defineAppConfig()(buildEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).toContain("vite-base64-assets");
    expect(pluginNames).toContain("vite-inject-nonce");
    expect(pluginNames).toContain("calculate-built-size");
  });

  it("allows overriding defaults", () => {
    const config = defineAppConfig({ useNonceInjection: false })(buildEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).not.toContain("vite-inject-nonce");
  });
});

describe("definePackageConfig", () => {
  it("enables base64 assets and built size but disables nonce injection", () => {
    const config = definePackageConfig()(buildEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).toContain("vite-base64-assets");
    expect(pluginNames).not.toContain("vite-inject-nonce");
    expect(pluginNames).toContain("calculate-built-size");
  });
});

describe("defineLibraryConfig", () => {
  const prodEnv: ConfigEnv = { command: "build", mode: "production" };
  const devEnv: ConfigEnv = { command: "build", mode: "development" };

  it("defaults to npm-full preset with ES and CJS formats", () => {
    const config = defineLibraryConfig({ name: "my-lib" })(prodEnv);
    expect(config.build.lib.formats).toEqual(["es", "cjs"]);
  });

  it("respects internal preset (ES only)", () => {
    const config = defineLibraryConfig({ name: "my-lib", preset: "internal" })(prodEnv);
    expect(config.build.lib.formats).toEqual(["es"]);
  });

  it("respects npm-esm preset", () => {
    const config = defineLibraryConfig({ name: "my-lib", preset: "npm-esm" })(prodEnv);
    expect(config.build.lib.formats).toEqual(["es"]);
  });

  it("respects cdn preset (UMD + IIFE)", () => {
    const config = defineLibraryConfig({ name: "my-lib", preset: "cdn" })(prodEnv);
    expect(config.build.lib.formats).toEqual(["umd", "iife"]);
  });

  it("respects universal preset (all formats)", () => {
    const config = defineLibraryConfig({ name: "my-lib", preset: "universal" })(prodEnv);
    expect(config.build.lib.formats).toEqual(["es", "cjs", "umd", "iife"]);
  });

  it("allows custom formats to override preset", () => {
    const config = defineLibraryConfig({ name: "my-lib", formats: ["es"] })(prodEnv);
    expect(config.build.lib.formats).toEqual(["es"]);
  });

  it("auto-generates global name from package name", () => {
    const config = defineLibraryConfig({ name: "@my-org/cool-lib" })(prodEnv);
    expect(config.build.lib.name).toBe("MyOrgCoolLib");
  });

  it("auto-generates global name from simple package name", () => {
    const config = defineLibraryConfig({ name: "my-lib" })(prodEnv);
    expect(config.build.lib.name).toBe("MyLib");
  });

  it("respects explicit globalName", () => {
    const config = defineLibraryConfig({ name: "my-lib", globalName: "CustomName" })(prodEnv);
    expect(config.build.lib.name).toBe("CustomName");
  });

  it("defaults entry to src/index.ts", () => {
    const config = defineLibraryConfig({ name: "my-lib" })(prodEnv);
    expect(config.build.lib.entry).toBe("src/index.ts");
  });

  it("respects custom entry", () => {
    const config = defineLibraryConfig({ name: "my-lib", entry: "src/main.ts" })(prodEnv);
    expect(config.build.lib.entry).toBe("src/main.ts");
  });

  it("generates correct file extensions for each format", () => {
    const config = defineLibraryConfig({ name: "my-lib", preset: "universal" })(prodEnv);
    const fileName = config.build.lib.fileName as (format: string) => string;
    expect(fileName("es")).toBe("index.mjs");
    expect(fileName("cjs")).toBe("index.cjs");
    expect(fileName("umd")).toBe("index.umd.js");
    expect(fileName("iife")).toBe("index.iife.js");
  });

  it("uses [name] pattern when preserveModules is true", () => {
    const config = defineLibraryConfig({ name: "my-lib", preserveModules: true })(prodEnv);
    const fileName = config.build.lib.fileName as (format: string) => string;
    expect(fileName("es")).toBe("[name].mjs");
    expect(fileName("cjs")).toBe("[name].cjs");
  });

  it("enables preserveModules in rollup output when option is set", () => {
    const config = defineLibraryConfig({ name: "my-lib", preserveModules: true })(prodEnv);
    expect(config.build.rollupOptions.output.preserveModules).toBe(true);
    expect(config.build.rollupOptions.output.preserveModulesRoot).toBe("src");
  });

  it("does not set preserveModules by default", () => {
    const config = defineLibraryConfig({ name: "my-lib" })(prodEnv);
    expect(config.build.rollupOptions.output.preserveModules).toBeUndefined();
  });

  it("passes external dependencies to rollup", () => {
    const config = defineLibraryConfig({ name: "my-lib", external: ["three", "react"] })(prodEnv);
    expect(config.build.rollupOptions.external).toEqual(["three", "react"]);
  });

  it("resolves user-provided globals", () => {
    const config = defineLibraryConfig({
      name: "my-lib",
      globals: { three: "THREE", react: "React" }
    })(prodEnv);
    const globalsFn = config.build.rollupOptions.output.globals as (id: string) => string;
    expect(globalsFn("three")).toBe("THREE");
    expect(globalsFn("react")).toBe("React");
  });

  it("falls back to package id when no global mapping exists", () => {
    const config = defineLibraryConfig({ name: "my-lib", globals: {} })(prodEnv);
    const globalsFn = config.build.rollupOptions.output.globals as (id: string) => string;
    expect(globalsFn("unknown-pkg")).toBe("unknown-pkg");
  });

  it("minifies in production mode-aware build", () => {
    const config = defineLibraryConfig({ name: "my-lib" })(prodEnv);
    expect(config.build.minify).toBe("terser");
    expect(config.build.sourcemap).toBe(false);
  });

  it("does not minify in development mode-aware build", () => {
    const config = defineLibraryConfig({ name: "my-lib" })(devEnv);
    expect(config.build.minify).toBe(false);
    expect(config.build.sourcemap).toBe(true);
  });

  it("never minifies and always sourcemaps in static build mode", () => {
    const configProd = defineLibraryConfig({ name: "my-lib", buildMode: "static" })(prodEnv);
    expect(configProd.build.minify).toBe(false);
    expect(configProd.build.sourcemap).toBe(true);

    const configDev = defineLibraryConfig({ name: "my-lib", buildMode: "static" })(devEnv);
    expect(configDev.build.minify).toBe(false);
    expect(configDev.build.sourcemap).toBe(true);
  });

  it("does not include base64 plugin by default", () => {
    const config = defineLibraryConfig({ name: "my-lib" })(prodEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).not.toContain("vite-base64-assets");
  });

  it("includes base64 plugin when enabled", () => {
    const config = defineLibraryConfig({ name: "my-lib", useBase64Assets: true })(prodEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).toContain("vite-base64-assets");
  });

  it("includes dts plugin", () => {
    const config = defineLibraryConfig({ name: "my-lib" })(prodEnv);
    const pluginNames = (config.plugins as { name: string }[]).map((p) => p.name).filter(Boolean);
    expect(pluginNames).toContain("vite:dts");
  });

  it("includes vitest config", () => {
    const config = defineLibraryConfig({ name: "my-lib" })(prodEnv);
    expect(config.test).toBeDefined();
    expect(config.test.name).toBe("my-lib");
    expect(config.test.globals).toBe(true);
    expect(config.test.environment).toBe("node");
  });

  it("respects jsdom test environment", () => {
    const config = defineLibraryConfig({ name: "my-lib", testEnvironment: "jsdom" })(prodEnv);
    expect(config.test.environment).toBe("jsdom");
  });

  it("includes test setup files when provided", () => {
    const config = defineLibraryConfig({ name: "my-lib", setupFiles: ["./test/setup.ts"] })(prodEnv);
    expect(config.test.setupFiles).toEqual(["./test/setup.ts"]);
  });

  it("does not include setupFiles when not provided", () => {
    const config = defineLibraryConfig({ name: "my-lib" })(prodEnv);
    expect(config.test.setupFiles).toBeUndefined();
  });

  it("respects testTimeout", () => {
    const config = defineLibraryConfig({ name: "my-lib", testTimeout: 10000 })(prodEnv);
    expect(config.test.testTimeout).toBe(10000);
  });

  it("respects passWithNoTests", () => {
    const config = defineLibraryConfig({ name: "my-lib", passWithNoTests: true })(prodEnv);
    expect(config.test.passWithNoTests).toBe(true);
  });

  it("generates cache dir from package name", () => {
    const config = defineLibraryConfig({ name: "@my-org/my-lib" })(prodEnv);
    expect(config.cacheDir).toBe("../../node_modules/.vite/packages/my-org-my-lib");
  });

  it("empties outDir by default", () => {
    const config = defineLibraryConfig({ name: "my-lib" })(prodEnv);
    expect(config.build.emptyOutDir).toBe(true);
  });
});
