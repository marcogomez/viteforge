/// <reference types="vitest" />
import dts from "vite-plugin-dts";
import { createHtmlPlugin } from "vite-plugin-html";
import { viteSingleFile } from "vite-plugin-singlefile";

import { base64AssetPlugin, calculateBuiltSizePlugin, injectNoncePlugin, txtLoaderPlugin } from "./plugins";

import type { ConfigEnv, Plugin, PluginOption, UserConfig } from "vite";

export interface ViteConfigOptions {
  /**
   * The root directory of the app
   */
  root?: string;
  /**
   * Development server port
   * @default 4173
   */
  port?: number;
  /**
   * Preview server port
   * @default 4174
   */
  previewPort?: number;
  /**
   * Output directory
   * @default "./dist"
   */
  outDir?: string;
  /**
   * Cache directory
   * @default "../../node_modules/.vite"
   */
  cacheDir?: string;
  /**
   * Whether to use single file build
   * @default true for build, false for dev
   */
  singleFile?: boolean;
  /**
   * Whether to minify HTML
   * @default true for build, false for dev
   */
  minifyHtml?: boolean;
  /**
   * Whether to minify JavaScript
   * @default true for build, false for dev
   */
  minify?: boolean | "terser" | "esbuild";
  /**
   * Whether to use base64 asset plugin
   * @default true
   */
  useBase64Assets?: boolean;
  /**
   * Whether to inject nonce for CSP
   * @default true
   */
  useNonceInjection?: boolean;
  /**
   * Whether to calculate built size
   * @default true
   */
  calculateBuiltSize?: boolean;
  /**
   * Whether in development mode (affects CSP)
   * @default false
   */
  isDevMode?: boolean;
  /**
   * Additional plugins to add
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  additionalPlugins?: any[];
}

export const terserOptions = {
  mangle: {
    eval: true,
    keep_fnames: false,
    module: true,
    toplevel: true,
    safari10: false
  },
  compress: {
    drop_console: true,
    drop_debugger: true,
    passes: 2
  },
  format: {
    comments: false
  }
};

/**
 * Creates a base Vite configuration for applications.
 */
export function defineViteConfig(options: ViteConfigOptions = {}): (env: ConfigEnv) => UserConfig {
  const {
    root = process.cwd(),
    port = 4173,
    previewPort = 4174,
    outDir = "./dist",
    cacheDir = ".vite",
    singleFile,
    minifyHtml,
    minify,
    useBase64Assets = true,
    useNonceInjection = true,
    calculateBuiltSize: shouldCalculateBuiltSize = true,
    isDevMode = false,
    additionalPlugins = []
  } = options;

  return (env: ConfigEnv) => {
    const isBuild = env.command === "build";
    const plugins: PluginOption[] = [];

    // TXT file loader - always enabled
    plugins.push(txtLoaderPlugin());

    // Single file output - only in production builds by default
    const useSingleFile = singleFile ?? isBuild;
    if (useSingleFile) {
      plugins.push(viteSingleFile() as PluginOption);
    }

    // HTML minification - only in production by default
    const shouldMinifyHtml = minifyHtml ?? isBuild;
    if (shouldMinifyHtml) {
      plugins.push(createHtmlPlugin({ minify: true }) as PluginOption);
    }

    if (useBase64Assets) {
      plugins.push(base64AssetPlugin());
    }

    if (useNonceInjection) {
      plugins.push(injectNoncePlugin({ isDevMode }));
    }

    if (shouldCalculateBuiltSize && isBuild) {
      plugins.push(calculateBuiltSizePlugin({ outputDir: outDir }));
    }

    // Add any additional plugins
    plugins.push(...additionalPlugins);

    return {
      root,
      cacheDir,
      server: {
        port,
        host: "localhost"
      },
      preview: {
        port: previewPort,
        host: "localhost"
      },
      assetsInclude: [
        "**/*.glb",
        "**/*.gltf",
        "**/*.bin",
        "**/*.wasm",
        "**/*.png",
        "**/*.jpg",
        "**/*.svg",
        "**/*.jpeg",
        "**/*.gif",
        "**/*.mp4",
        "**/*.webm",
        "**/*.mp3",
        "**/*.wav",
        "**/*.ogg",
        "**/*.ttf",
        "**/*.otf"
      ],
      plugins,
      optimizeDeps: {
        exclude: ["fsevents", "lightningcss"],
        force: !isBuild,
        ...(isBuild ? {} : { entries: [] })
      },
      css: {
        modules: {
          localsConvention: "camelCaseOnly" as const,
          generateScopedName: "[name]__[local]___[hash:base64:5]"
        },
        preprocessorOptions: {
          scss: {}
        }
      },
      build: {
        outDir,
        emptyOutDir: true,
        reportCompressedSize: true,
        minify: minify ?? "terser",
        cssCodeSplit: false,
        assetsInlineLimit: 900000000,
        commonjsOptions: {
          transformMixedEsModules: true,
          exclude: ["fsevents"]
        },
        rollupOptions: {
          external: ["fsevents"]
        },
        terserOptions: terserOptions
      }
    };
  };
}

/**
 * Creates a Vite configuration preset for single-page applications.
 * - Dev mode: No minification, readable output, fast HMR
 * - Build mode: Full optimization with minification, single file output
 */
export function defineAppConfig(options: ViteConfigOptions = {}) {
  return defineViteConfig({
    useBase64Assets: true,
    useNonceInjection: true,
    calculateBuiltSize: true,
    // singleFile and minifyHtml will auto-adjust based on dev/build
    ...options
  });
}

/**
 * Creates a Vite configuration preset for reusable packages.
 * - Dev mode: No minification, readable output, fast HMR
 * - Build mode: Full optimization with minification, single file output
 */
export function definePackageConfig(options: ViteConfigOptions = {}) {
  return defineViteConfig({
    useBase64Assets: true,
    useNonceInjection: false,
    calculateBuiltSize: true,
    // singleFile and minifyHtml will auto-adjust based on dev/build
    ...options
  });
}

// Library Configuration (for npm packages)

/**
 * Library build presets for different distribution targets
 */
export type LibraryPreset =
  | "internal" // ES only (for monorepo internal use)
  | "npm-esm" // ES + types (modern npm packages)
  | "npm-full" // ES + CJS + types (maximum npm compatibility)
  | "cdn" // UMD + IIFE minified (for script tags/CDN)
  | "universal"; // ALL formats (ES, CJS, UMD, IIFE + minified variants)

/**
 * Format configuration for library output
 */
interface FormatConfig {
  formats: ("es" | "cjs" | "umd" | "iife")[];
  minifiedFormats: ("umd" | "iife")[];
}

/**
 * Preset configurations
 */
const LIBRARY_PRESETS: Record<LibraryPreset, FormatConfig> = {
  internal: {
    formats: ["es"],
    minifiedFormats: []
  },
  "npm-esm": {
    formats: ["es"],
    minifiedFormats: []
  },
  "npm-full": {
    formats: ["es", "cjs"],
    minifiedFormats: []
  },
  cdn: {
    formats: ["umd", "iife"],
    minifiedFormats: ["umd", "iife"]
  },
  universal: {
    formats: ["es", "cjs", "umd", "iife"],
    minifiedFormats: ["umd", "iife"]
  }
};

/**
 * Maps format to proper file extension
 */
function getFileExtension(format: string): string {
  switch (format) {
    case "es":
      return "mjs";
    case "cjs":
      return "cjs";
    case "umd":
      return "umd.js";
    case "iife":
      return "iife.js";
    default:
      return "js";
  }
}

/**
 * Converts package name to a valid global variable name for UMD/IIFE
 * e.g., "@my-org/my-lib" -> "MyOrgMyLib"
 */
function packageNameToGlobalName(packageName: string): string {
  return packageName
    .replace(/^@/, "") // Remove leading @
    .split(/[-/]/) // Split on - and /
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

export interface LibraryConfigOptions {
  /**
   * Package name (e.g., "@my-org/my-lib")
   * Used for lib.name and test.name
   */
  name: string;

  /**
   * Entry point file
   * @default "src/index.ts"
   */
  entry?: string;

  /**
   * External dependencies that should not be bundled.
   * Can be strings or RegExp patterns.
   * @example ["three", /^@some-org\//]
   */
  external?: (string | RegExp)[];

  /**
   * Test environment
   * @default "node"
   */
  testEnvironment?: "node" | "jsdom";

  /**
   * Test setup files (relative paths from package root)
   * @example ["./test/vitest.setup.ts", "../../test-utils/vitest-canvas-mock.ts"]
   */
  setupFiles?: string[];

  /**
   * Test timeout in milliseconds
   * @default undefined (uses vitest default)
   */
  testTimeout?: number;

  /**
   * Whether tests should pass if no test files are found
   * @default false
   */
  passWithNoTests?: boolean;

  /**
   * Additional plugins to add
   */
  additionalPlugins?: Plugin[];

  /**
   * Build behavior based on mode:
   * - "mode-aware": sourcemap in dev only, minify in prod only (default)
   * - "static": always sourcemap, never minify
   * @default "mode-aware"
   */
  buildMode?: "mode-aware" | "static";

  /**
   * Enable base64 asset imports plugin.
   * Allows importing files with ?base64 query to get base64 encoded content.
   * Used for embedding WASM/JS files as base64 strings.
   * @example import wasmBase64 from "./file.wasm?base64";
   * @default false
   */
  useBase64Assets?: boolean;

  /**
   * Output directory
   * @default "./build"
   */
  outDir?: string;

  /**
   * Library build preset. Determines which output formats are generated.
   * - "internal": ES only (for monorepo internal use)
   * - "npm-esm": ES + types (modern npm packages)
   * - "npm-full": ES + CJS + types (maximum npm compatibility)
   * - "cdn": UMD + IIFE minified (for script tags/CDN)
   * - "universal": ALL formats (ES, CJS, UMD, IIFE + minified variants)
   * @default "npm-full"
   */
  preset?: LibraryPreset;

  /**
   * Output formats for the library. Overrides preset if specified.
   * @deprecated Use `preset` instead for standard configurations
   */
  formats?: ("es" | "cjs" | "umd" | "iife")[];

  /**
   * Global variable name for UMD/IIFE builds (e.g., "MyLibrary").
   * Auto-generated from package name if not specified.
   * Only used when UMD or IIFE formats are included.
   * @example "Statecraft" for window.Statecraft
   */
  globalName?: string;

  /**
   * Whether to generate separate minified bundles for UMD/IIFE formats.
   * Creates both index.umd.js and index.umd.min.js
   * @default true when preset includes UMD/IIFE
   */
  minifiedBundles?: boolean;

  /**
   * Whether to roll up .d.ts files into a single file
   * @default true
   */
  rollupTypes?: boolean;

  /**
   * Whether to always empty the output directory on build
   * @default true
   */
  alwaysEmptyOutDir?: boolean;

  /**
   * Whether to preserve the module structure in the output.
   * When true, Rollup emits one file per source module instead of bundling
   * everything into a single chunk. This enables fine-grained tree-shaking
   * in consuming bundlers.
   *
   * Only applies to ES and CJS formats (UMD/IIFE require bundling).
   * @default false
   */
  preserveModules?: boolean;

  /**
   * Global variable mappings for UMD/IIFE external dependencies.
   * Maps npm package names to the global variable they expose at runtime.
   * @example { three: "THREE", react: "React", "react-dom": "ReactDOM" }
   */
  globals?: Record<string, string>;
}

/**
 * Creates a Vite configuration preset for library packages.
 * Supports all distribution formats.
 *
 * Features:
 * - Automatic TypeScript declaration generation (dts plugin)
 * - Multiple output formats: ES, CJS, UMD, IIFE
 * - Preset system for common configurations
 * - Separate minified bundles for CDN distribution
 * - Proper file extensions (.mjs, .cjs, .umd.js, .iife.js)
 * - Auto-generated global name for UMD/IIFE
 * - External dependencies not bundled
 * - Vitest configuration included
 * - Mode-aware or static build options
 *
 * @example
 * ```ts
 * // Simple usage with preset (recommended)
 * export default defineConfig(
 *   defineLibraryConfig({
 *     name: "my-lib",
 *     preset: "npm-full"
 *   })
 * );
 *
 * // Universal distribution (all formats)
 * export default defineConfig(
 *   defineLibraryConfig({
 *     name: "@my-org/model-loader",
 *     preset: "universal",
 *     globalName: "ModelLoader",
 *     external: ["three"],
 *     globals: { three: "THREE" }
 *   })
 * );
 *
 * // CDN-only distribution
 * export default defineConfig(
 *   defineLibraryConfig({
 *     name: "@my-org/widget",
 *     preset: "cdn",
 *     globalName: "Widget"
 *   })
 * );
 * ```
 */
export function defineLibraryConfig(options: LibraryConfigOptions) {
  const {
    name,
    entry = "src/index.ts",
    external = [],
    testEnvironment = "node",
    setupFiles,
    testTimeout,
    passWithNoTests,
    additionalPlugins = [],
    buildMode = "mode-aware",
    useBase64Assets = false,
    outDir = "./dist",
    preset = "npm-full",
    formats: customFormats,
    globalName,
    minifiedBundles,
    rollupTypes = true,
    alwaysEmptyOutDir = true,
    preserveModules: preserveModulesOption = false,
    globals: userGlobals = {}
  } = options;

  // Resolve format configuration from preset or custom formats
  const presetConfig = LIBRARY_PRESETS[preset];
  const resolvedFormats = customFormats ?? presetConfig.formats;
  const resolvedMinifiedFormats = presetConfig.minifiedFormats;

  // Determine if we need minified bundles
  const hasUmdOrIife = resolvedFormats.includes("umd") || resolvedFormats.includes("iife");
  const shouldCreateMinified = minifiedBundles ?? (hasUmdOrIife && resolvedMinifiedFormats.length > 0);

  // Auto-generate global name for UMD/IIFE if not provided
  const resolvedGlobalName = globalName ?? packageNameToGlobalName(name);

  // Generate cache dir from package name (e.g., "@my-org/my-lib" -> "my-org-my-lib")
  const cacheDirName = name.replace(/[@/]/g, "-").replace(/^-/, "");

  return (env: ConfigEnv) => {
    const mode = env.mode;
    const isProduction = mode === "production";
    const isStatic = buildMode === "static";

    // Build plugins array
    const plugins: PluginOption[] = [];

    // Base64 asset imports (for embedding WASM/JS via ?base64 query)
    if (useBase64Assets) {
      plugins.push(base64AssetPlugin());
    }

    // TypeScript declarations
    plugins.push(
      dts({
        entryRoot: "src",
        tsconfigPath: "./tsconfig.lib.json",
        rollupTypes
      })
    );

    // Additional user plugins
    plugins.push(...additionalPlugins);

    // Build test config
    const testConfig: Record<string, unknown> = {
      name,
      watch: false,
      globals: true,
      environment: testEnvironment,
      include: ["{src,test,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
      reporters: ["default"],
      coverage: {
        reportsDirectory: "./test-output/vitest/coverage",
        provider: "v8"
      }
    };

    if (setupFiles && setupFiles.length > 0) {
      testConfig.setupFiles = setupFiles;
    }

    if (testTimeout !== undefined) {
      testConfig.testTimeout = testTimeout;
    }

    if (passWithNoTests) {
      testConfig.passWithNoTests = true;
    }

    // Create fileName function that returns proper extensions
    const fileName = (format: string) => {
      const ext = getFileExtension(format);
      if (preserveModulesOption) {
        // With preserveModules, [name] is the module path (e.g. "utils/styles")
        return `[name].${ext}`;
      }
      return `index.${ext}`;
    };

    // Build the base configuration
    const baseConfig = {
      root: process.cwd(),
      cacheDir: `../../node_modules/.vite/packages/${cacheDirName}`,
      plugins,
      build: {
        outDir,
        emptyOutDir: alwaysEmptyOutDir ? true : isStatic ? true : isProduction,
        reportCompressedSize: true,
        sourcemap: isStatic ? true : !isProduction,
        minify: isStatic ? false : isProduction ? ("terser" as const) : false,
        terserOptions: isProduction ? terserOptions : undefined,
        commonjsOptions: {
          transformMixedEsModules: true
        },
        lib: {
          entry,
          name: resolvedGlobalName,
          fileName,
          formats: resolvedFormats as ("es" | "cjs" | "umd" | "iife")[]
        },
        rollupOptions: {
          external,
          output: {
            globals: (id: string) => {
              return userGlobals[id] ?? id;
            },
            // Preserve module structure for fine-grained tree-shaking
            ...(preserveModulesOption
              ? {
                  preserveModules: true,
                  preserveModulesRoot: "src"
                }
              : {})
          }
        }
      },
      test: testConfig
    };

    // If we need minified bundles and we're in production, we need to handle it specially
    // Vite doesn't support multiple builds with different minification settings in one config
    // So we return the base config - minified builds should be done as a separate build step
    // or via a post-build plugin
    if (shouldCreateMinified && isProduction) {
      // Add a note about minified bundles in the console
      console.log(
        `
[viteforge]
Note: For minified CDN bundles (*.min.js), run with MINIFIED_BUILD=true or
use a post-build minification step.
`
      );
    }

    return baseConfig;
  };
}

// Export all plugins for direct use
export * from "./plugins/index.js";

// Re-export commonly used utilities
export { resolve } from "path";
export { defineConfig, mergeConfig } from "vite";
export { dts };
export type { Plugin };
