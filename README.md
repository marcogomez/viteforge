# @mgz-dev/viteforge

Build and serve utilities for Vite. Pre-configured presets for apps, packages, and libraries, plus a collection of plugins for asset embedding, shader loading, HTML compression, dev reload, and more.

I built this for game jams. The goal: write a game, run one command, and get a single self-contained HTML file. No server required and no dependencies at runtime. The HTML file works like a binary: I can just send it to someone, they double-click it, and it runs (or, I host it anywhere and it just works). Everything (JavaScript, CSS, textures, models, shaders, audio) is inlined and compressed into one file that decompresses and boots itself in the browser.

## Install

```sh
pnpm add -D @mgz-dev/viteforge vite
```

Then in your `vite.config.ts`:

```ts
import { defineAppConfig, defineConfig } from "@mgz-dev/viteforge";

export default defineConfig(defineAppConfig());
```

That's it. Build with `vite build`, dev with `vite`.

## Recommended Setup Install

With codestyle for ESLint, Prettier, and TypeScript

```sh
pnpm add -D @mgz-dev/viteforge @mgz-dev/codestyle vite eslint prettier
```

ESLint Config:
```js
// eslint.config.mjs
export { default } from "@mgz-dev/codestyle";
```

Prettier Config:
```js
// prettier.config.mjs
export { default } from "@mgz-dev/codestyle/prettier";
```
TypeScript Config:

```json
// tsconfig.json
{
  "extends": "@mgz-dev/codestyle/tsconfig/base.json",
  "compilerOptions": {
  "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

> *See [@mgz-dev/codestyle](https://github.com/marcogomez/codestyle) for full documentation.*


---

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration Presets](#configuration-presets)
  - [defineAppConfig](#defineappconfigoptions) - Single-page applications
  - [definePackageConfig](#definepackageconfigoptions) - Reusable packages
  - [defineLibraryConfig](#definelibraryconfigoptions) - npm libraries
  - [defineViteConfig](#defineviteconfigoptions) - Base configuration
- [Library Presets](#library-presets)
- [Plugins](#plugins)
  - [base64AssetPlugin](#base64assetplugin) - Embed assets as base64
  - [txtLoaderPlugin](#txtloaderplugin) - Load text files as strings
  - [textFilePlugin](#textfileplugin) - Virtual modules from files
  - [injectNoncePlugin](#injectnonceplugin) - CSP nonce injection
  - [calculateBuiltSizePlugin](#calculatebuiltsizeplugin) - Build size reporting
  - [restartOnRebuildPlugin](#restartonrebuildplugin) - Auto-restart servers
  - [getGLSLPlugin](#getglslplugin) - GLSL/WGSL shader imports
  - [postProcessingPlugin](#postprocessingplugin) - HTML compression
  - [workerPlugin](#workerplugin) - Web Worker bundling
  - [devReloadPlugin](#devreloadplugin) - Browser reload on server rebuild
- [Dev Reload (Server + Client)](#dev-reload-server--client)
- [Building a Universal Library](#building-a-universal-library)
- [Monorepo Usage](#monorepo-usage)
- [Configuration Reference](#configuration-reference)
- [Re-exported Utilities](#re-exported-utilities)

---

## Quick Start

### Single-page application

```ts
// vite.config.ts
import { defineAppConfig, defineConfig } from "@mgz-dev/viteforge";

export default defineConfig(defineAppConfig({ port: 3000 }));
```

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### npm library

```ts
// vite.config.ts
import { defineConfig, defineLibraryConfig } from "@mgz-dev/viteforge";

export default defineConfig(
  defineLibraryConfig({
    name: "my-lib",
    preset: "npm-full"
  })
);
```

```json
{
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch"
  }
}
```

### Node.js server with auto-restart

```ts
// vite.config.ts
import { defineConfig, defineLibraryConfig, restartOnRebuildPlugin } from "@mgz-dev/viteforge";

export default defineConfig(
  defineLibraryConfig({
    name: "my-server",
    preset: "npm-esm",
    additionalPlugins: [
      restartOnRebuildPlugin({ startCommand: "node ./dist/index.mjs" })
    ]
  })
);
```

```json
{
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build",
    "start": "node ./dist/index.mjs"
  }
}
```

---

## Configuration Presets

### `defineAppConfig(options)`

For single-page applications. Enables all the bells and whistles by default.

What you get:
- Single-file output in build mode (all JS/CSS inlined into one HTML file)
- HTML minification in build mode
- Base64 asset inlining
- CSP nonce injection
- Build size reporting
- Terser minification (drops console/debugger, strips comments)

```ts
import { defineAppConfig, defineConfig } from "@mgz-dev/viteforge";

export default defineConfig(
  defineAppConfig({
    port: 8080,
    previewPort: 8081,
    isDevMode: process.env.DEV_MODE === "true"
  })
);
```

| Feature | Dev Mode | Build Mode |
|---------|----------|------------|
| Single file output | No | Yes |
| HTML minification | No | Yes |
| JS minification | No | Yes (terser) |
| Base64 assets | Yes | Yes |
| CSP nonce | Yes | Yes |
| Build size report | No | Yes |

### `definePackageConfig(options)`

Same as `defineAppConfig`, but with CSP nonce injection disabled. Use for packages that export components but don't have their own HTML.

```ts
import { defineConfig, definePackageConfig } from "@mgz-dev/viteforge";

export default defineConfig(definePackageConfig({ port: 8090 }));
```

### `defineLibraryConfig(options)`

For npm packages and libraries. Generates multiple output formats, TypeScript declarations, and includes a Vitest configuration.

```ts
import { defineConfig, defineLibraryConfig } from "@mgz-dev/viteforge";

export default defineConfig(
  defineLibraryConfig({
    name: "@my-org/my-lib",
    preset: "npm-full",
    external: ["three"],
    globals: { three: "THREE" }
  })
);
```

See [Library Presets](#library-presets) for all available presets and [Building a Universal Library](#building-a-universal-library) for a complete walkthrough.

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | **(required)** | Package name |
| `preset` | `LibraryPreset` | `"npm-full"` | Output format preset |
| `entry` | `string` | `"src/index.ts"` | Entry point |
| `external` | `(string \| RegExp)[]` | `[]` | Dependencies to exclude from bundle |
| `globals` | `Record<string, string>` | `{}` | UMD/IIFE global variable mappings |
| `globalName` | `string` | auto-generated | Global name for UMD/IIFE builds |
| `buildMode` | `"mode-aware" \| "static"` | `"mode-aware"` | `mode-aware`: sourcemaps in dev, minify in prod. `static`: always sourcemaps, never minify |
| `useBase64Assets` | `boolean` | `false` | Enable `?base64` asset imports |
| `outDir` | `string` | `"./dist"` | Output directory |
| `formats` | `string[]` | from preset | Override preset formats |
| `rollupTypes` | `boolean` | `true` | Roll up `.d.ts` into a single file |
| `alwaysEmptyOutDir` | `boolean` | `true` | Empty output dir before each build |
| `preserveModules` | `boolean` | `false` | Emit one file per source module for fine-grained tree-shaking |
| `testEnvironment` | `"node" \| "jsdom"` | `"node"` | Vitest environment |
| `setupFiles` | `string[]` | - | Vitest setup files |
| `testTimeout` | `number` | - | Vitest timeout (ms) |
| `passWithNoTests` | `boolean` | `false` | Pass if no test files found |
| `additionalPlugins` | `Plugin[]` | `[]` | Additional Vite plugins |
| `minifiedBundles` | `boolean` | auto | Generate separate `.min.js` bundles |

### `defineViteConfig(options)`

The base configuration that all presets build on. Use it when you want full control.

```ts
import { defineConfig, defineViteConfig } from "@mgz-dev/viteforge";

export default defineConfig(
  defineViteConfig({
    port: 3000,
    useBase64Assets: true,
    useNonceInjection: false,
    singleFile: false,
    minify: "esbuild"
  })
);
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `root` | `string` | `process.cwd()` | Project root directory |
| `port` | `number` | `4173` | Dev server port |
| `previewPort` | `number` | `4174` | Preview server port |
| `outDir` | `string` | `"./dist"` | Build output directory |
| `cacheDir` | `string` | `".vite"` | Vite cache directory |
| `singleFile` | `boolean` | build: `true`, dev: `false` | Bundle into single HTML file |
| `minifyHtml` | `boolean` | build: `true`, dev: `false` | Minify HTML output |
| `minify` | `boolean \| "terser" \| "esbuild"` | `"terser"` | JS minification strategy |
| `useBase64Assets` | `boolean` | `true` | Enable base64 asset plugin |
| `useNonceInjection` | `boolean` | `true` | Enable CSP nonce injection |
| `calculateBuiltSize` | `boolean` | `true` | Report build size |
| `isDevMode` | `boolean` | `false` | Dev mode (strips CSP meta tag) |
| `additionalPlugins` | `any[]` | `[]` | Additional Vite plugins |

---

## Library Presets

| Preset | Formats | Use Case |
|--------|---------|----------|
| `"internal"` | ES | Packages consumed only within your monorepo |
| `"npm-esm"` | ES | Modern ESM-only npm packages |
| `"npm-full"` | ES + CJS | Maximum npm compatibility (default) |
| `"cdn"` | UMD + IIFE | Script tags and CDN distribution |
| `"universal"` | ES + CJS + UMD + IIFE | Every distribution channel |

Output file extensions:

| Format | Extension | Loaded via |
|--------|-----------|------------|
| ES | `.mjs` | `import` |
| CJS | `.cjs` | `require()` |
| UMD | `.umd.js` | AMD, CommonJS, or `<script>` tag |
| IIFE | `.iife.js` | `<script>` tag |

---

## Plugins

All plugins can be imported from the package root or from the `/plugins` subpath:

```ts
import { base64AssetPlugin } from "@mgz-dev/viteforge";
// or
import { base64AssetPlugin } from "@mgz-dev/viteforge/plugins";
```

### `base64AssetPlugin()`

Embeds assets as base64 data URIs directly in your JavaScript bundle.

```ts
// Import an asset — returns a data URI string
import model from "./model.glb";
// "data:model/gltf-binary;base64,..."

// Use ?base64 for raw base64 (no data URI prefix) — works with any file type
import wasmBase64 from "./physics.wasm?base64";
// "SGVsbG8gd29ybGQ="

// Or use the base64: prefix — same behavior, reads like intent
import wasmBase64 from "base64:./physics.wasm";

// Both syntaxes work with node_modules
import font from "some-package/font.ttf?base64";
// or
import font from "base64:some-package/font.ttf";
```

Supported extensions (auto-detected, returned as data URIs):
`.glb`, `.gltf`, `.fbx`, `.obj`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webm`, `.mp4`, `.mp3`, `.ogg`, `.wav`, `.ttf`, `.otf`

SVGs get special treatment: they are optimized with svgo and returned as URL-encoded data URIs (smaller than base64 for SVGs).

The `?base64` query works with **any** file type and returns a raw base64 string.

### `txtLoaderPlugin()`

Loads text-based files as string exports. Always enabled in all presets.

```ts
import readme from "./data.txt";
import lut from "./color-grading.cube";
import lut2 from "./lookup.3dl";
```

Supported: `.txt`, `.cube` (LUT), `.3dl` (LUT)

### `textFilePlugin(virtualModuleId, filePath)`

Creates a virtual module that exports a file's contents as a string. Useful for embedding generated code.

```ts
// vite.config.ts
import { defineConfig, resolve, textFilePlugin } from "@mgz-dev/viteforge";

export default defineConfig({
  plugins: [
    textFilePlugin("iframe-runner-code", resolve(__dirname, "./dist/iframe-runner.js"))
  ]
});

// In your code
import iframeCode from "iframe-runner-code";
```

### `injectNoncePlugin(options?)`

Injects a CSP nonce into all `<script>` tags and updates the CSP `<meta>` tag. A new random nonce is generated on each build.

```ts
injectNoncePlugin({ isDevMode: false })
```

Your HTML must include a CSP meta tag:

```html
<meta http-equiv="Content-Security-Policy" content="script-src 'self';">
```

Set `isDevMode: true` to remove the CSP meta tag entirely (for easier debugging in development).

### `calculateBuiltSizePlugin(options?)`

Logs the total build output size in bytes, SI (kB/MB), and IEC (KiB/MiB) after compilation. Only runs in build mode.

```ts
calculateBuiltSizePlugin({ outputDir: "./dist" })
```

### `restartOnRebuildPlugin(options)`

Kills and restarts a Node.js process after each rebuild. Designed for `vite build --watch`.

```ts
restartOnRebuildPlugin({
  startCommand: "node ./dist/index.mjs",
  delay: 100  // ms to wait before starting (default: 100)
})
```

### `getGLSLPlugin()`

Enables importing GLSL and WGSL shader files. This is an async function, so use `await`.

```ts
// vite.config.ts
import { defineConfig, getGLSLPlugin } from "@mgz-dev/viteforge";

export default defineConfig({
  plugins: [await getGLSLPlugin()]
});

// In your code
import vertexShader from "./shaders/vertex.vert";
import fragmentShader from "./shaders/fragment.frag";
import computeShader from "./shaders/compute.wgsl";
```

If your config loader does not support top-level `await` (e.g. Electron Forge outputs CJS), wrap the config in an async function:

```ts
// vite.config.ts
import { defineConfig, getGLSLPlugin } from "@mgz-dev/viteforge";

async function getConfig() {
  return defineConfig({
    plugins: [await getGLSLPlugin()]
  });
}

export default getConfig();
```

Supported: `.glsl`, `.wgsl`, `.vert`, `.vs`, `.frag`, `.fs`

Shaders support `#include` directives for composing shaders from multiple files.

### `postProcessingPlugin(options?)`

Compresses the final HTML bundle using deflate. Extracts all inline JS/CSS, compresses into a binary blob, and wraps it in a self-extracting HTML page. The result is a single HTML file that decompresses and runs itself.

```ts
postProcessingPlugin({
  enabled: true,
  compressionLevel: 9,        // 1-9 (default: 9)
  logStats: true,              // Log compression stats (default: true)
  titleString: "My Game",     // HTML <title> tag
  iconString: '<svg>...</svg>', // SVG favicon (optimized with svgo)
  usePako: false               // false: native DecompressionStream (default)
                                // true: bundle pako for older browsers
})
```

Output example:
```
[post-processing] Compression complete:
  Original HTML:      1.14 MB
  Script content:     1.14 MB
  Compressed blob:    404.84 KB (34.8% of script)
  Final HTML:         406.11 KB
  Total savings:      758.74 KB (65.1% reduction)
```

Set `usePako: true` if you need to support Firefox < 105 or Safari < 16.4 (browsers without `DecompressionStream`).

### `workerPlugin()`

Bundles `.worker` imports as separate IIFE bundles and returns blob URLs for `new Worker()` instantiation.

```ts
// vite.config.ts
export default defineConfig({
  plugins: [workerPlugin()]
});

// In your code
import workerUrl from "./physics.worker";
const worker = new Worker(workerUrl);
```

The worker file should be a `.ts` file — the plugin appends `.ts` when resolving. The worker is compiled as a minified IIFE with all dependencies bundled (no externals).

### `devReloadPlugin(options?)`

Starts a lightweight WebSocket server during `vite build --watch`. When a rebuild completes, all connected browser clients receive a reload signal.

See [Dev Reload](#dev-reload-server--client) for the full setup.

```ts
devReloadPlugin({ port: 21816 })  // default port
```

---

## Dev Reload (Server + Client)

When your Node.js server serves the client directly (no separate Vite dev server), you need a way to tell the browser "the server rebuilt, reload." This is a two-piece setup:

### Server side

Add `devReloadPlugin` to your **server's** vite.config.ts. It starts a WebSocket server inside the Vite build process and sends a `"change"` message to all connected browsers after every rebuild.

```ts
// server/vite.config.ts
import { defineConfig, defineLibraryConfig, devReloadPlugin } from "@mgz-dev/viteforge";

export default defineConfig(
  defineLibraryConfig({
    name: "my-server",
    preset: "npm-esm",
    additionalPlugins: [
      devReloadPlugin({ port: 21816 })
    ]
  })
);
```

### Client side

Use `devReloadClientScript()` to get a JavaScript snippet that connects to the WebSocket server and calls `location.reload()` on any message. Inject it into your client HTML during development builds only.

```ts
// client/vite.config.ts
import { defineAppConfig, defineConfig, devReloadClientScript } from "@mgz-dev/viteforge";

const isDev = process.env.DEV_MODE === "true";

export default defineConfig(
  defineAppConfig({
    additionalPlugins: isDev
      ? [
          {
            name: "inject-dev-reload",
            transformIndexHtml(html) {
              const script = devReloadClientScript({ port: 21816 });
              return html.replace("</head>", `<script>${script}</script></head>`);
            }
          }
        ]
      : []
  })
);
```

The client snippet auto-reconnects (up to 5 times) when the connection drops — which happens when the server process restarts.

In production, you simply don't add either plugin. No dev code in your prod builds.

---

## Building a Universal Library

A complete recipe for a library consumable via ESM, CJS, UMD (AMD/CDN), and IIFE (script tag).

### vite.config.ts

```ts
import { defineConfig, defineLibraryConfig } from "@mgz-dev/viteforge";

export default defineConfig(
  defineLibraryConfig({
    name: "@my-org/my-lib",
    preset: "universal",
    globalName: "MyLib",
    external: ["three"],
    globals: { three: "THREE" }
  })
);
```

### package.json

```json
{
  "name": "@my-org/my-lib",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "browser": "./dist/index.umd.js",
  "unpkg": "./dist/index.umd.js",
  "jsdelivr": "./dist/index.umd.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["./dist"]
}
```

**Order matters in `exports`.** `types` must come first.

**Do NOT put `"browser"` inside the `exports` field** — it causes bundlers to pick UMD over ESM. The top-level `"browser"` field is fine for legacy tooling.

### tsconfig.lib.json

Required by the dts plugin:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
```

### Output

```
dist/
  index.mjs        # ESM
  index.cjs        # CJS
  index.umd.js     # UMD
  index.iife.js    # IIFE
  index.d.ts       # TypeScript declarations
  index.d.ts.map   # Declaration source maps
```

### How consumers use it

```ts
// ESM
import { MyClass } from "@my-org/my-lib";

// CJS
const { MyClass } = require("@my-org/my-lib");

// CDN
<script src="https://unpkg.com/@my-org/my-lib"></script>
<script>
  const { MyClass } = window.MyLib;
</script>
```

### Best practices

Use **named exports only**. Avoid default exports — they cause CJS consumers to need `.default`:

```ts
// Don't do this
export default MyClass;

// Do this
export { MyClass };
```

---

## Monorepo Usage

The presets produce clean configs with no monorepo-specific settings. If you're in a monorepo with workspace packages, use `mergeConfig` to layer your monorepo defaults on top:

```ts
// shared/monorepo-config.ts
import { defineAppConfig, mergeConfig } from "@mgz-dev/viteforge";

const monorepoDefaults = {
  server: {
    watch: { ignored: ["!**/node_modules/@my-org/**"] },
    fs: { allow: ["../.."] }
  },
  optimizeDeps: {
    exclude: ["@my-org/*"],
    include: ["three"]
  }
};

export const defineMonorepoAppConfig = (opts) =>
  (env) => mergeConfig(defineAppConfig(opts)(env), monorepoDefaults);
```

```ts
// apps/my-app/vite.config.ts
import { defineConfig } from "@mgz-dev/viteforge";
import { defineMonorepoAppConfig } from "../../shared/monorepo-config";

export default defineConfig(defineMonorepoAppConfig({ port: 3000 }));
```

---

## Configuration Reference

### Terser options

Production builds use aggressive terser settings by default:

- Mangles all names (toplevel, module, eval)
- Drops `console.*` and `debugger` statements
- Strips all comments
- 2 optimization passes

The `terserOptions` object is exported if you need to reference or extend it.

### Asset handling

All presets recognize these file types as assets:
`.glb`, `.gltf`, `.bin`, `.wasm`, `.png`, `.jpg`, `.svg`, `.jpeg`, `.gif`, `.mp4`, `.webm`, `.mp3`, `.wav`, `.ogg`, `.ttf`, `.otf`

In build mode, assets are inlined (the inline limit is set to 900MB — effectively everything).

---

## Re-exported Utilities

The package re-exports these for convenience so you don't need extra imports:

```ts
import { defineConfig, mergeConfig, resolve, dts } from "@mgz-dev/viteforge";
import type { Plugin } from "@mgz-dev/viteforge";
```

- `defineConfig` and `mergeConfig` from `vite`
- `dts` from `vite-plugin-dts`
- `resolve` from `path`
- `Plugin` type from `vite`

---

## Releasing

This package uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing.

### When you make a change

After making your changes, create a changeset to describe what changed:

```sh
pnpm changeset
```

You'll be prompted to:
1. Select the package
2. Choose the bump type:
   - **patch** — bug fixes, dependency updates, internal refactors
   - **minor** — new plugins, new config options, new features
   - **major** — breaking changes to existing presets, removed options, renamed exports
3. Write a summary of the change

Commit the changeset file with your code.

### How publishing works

When you push to `master` (or merge a PR):

1. The CI **release** workflow detects pending changeset files
2. It opens a "Version Package" PR that bumps the version in `package.json` and updates `CHANGELOG.md`
3. When you merge that PR, the workflow publishes to npm automatically via trusted publishing (OIDC)

No npm tokens to manage or rotate. GitHub Actions authenticates directly with npm.

### First-time setup

The very first publish must be done manually because trusted publishing requires the package to already exist on npm.

1. Use your existing npm token (or create a temporary 90-day granular one at Profile > Access Tokens)
2. Publish manually:
   ```sh
   npm publish --access public --//registry.npmjs.org/:_authToken=$(cat ~/.npmtoken)
   ```
3. Configure trusted publishing on npm: go to `https://www.npmjs.com/package/@mgz-dev/viteforge/access`, click **GitHub Actions**, and fill in:
   - **Organization or user**: `marcogomez` (case-sensitive)
   - **Repository**: `viteforge`
   - **Workflow filename**: `release.yml`
   - **Allowed actions**: select "npm publish"
4. Delete the temporary npm token

### Manual publishing (if needed)

```sh
pnpm changeset        # create a changeset
pnpm run version      # bump version + update CHANGELOG
pnpm run release      # publish to npm
```
