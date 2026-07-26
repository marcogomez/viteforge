import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// libvips caches input file handles, which blocks temp dir deletion on
// windows (open files cannot be removed there). the cache is pointless in
// tests, so it goes off before any pipeline runs.
sharp.cache(false);
import { postProcessingPlugin } from "../src/plugins/post-processing";
import { generateSocialTags, processScreenshot, resolveCardImageUrl } from "../src/plugins/social-card";

import type { SocialCardImage } from "../src/plugins/social-card";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-card-test-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  // retries cover windows, where a still-closing handle makes rm fail with
  // EPERM instead of succeeding like on posix
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  vi.restoreAllMocks();
});

async function writeFixtureScreenshot(dir: string, width = 1920, height = 1080): Promise<string> {
  const file = path.join(dir, "screenshot.png");
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 20, b: 90 } }
  })
    .png()
    .toBuffer();
  fs.writeFileSync(file, buffer);
  return file;
}

describe("resolveCardImageUrl", () => {
  it("joins against a url with a trailing slash", () => {
    expect(resolveCardImageUrl("https://games.mgz.dev/g/limits/", "card.jpg")).toBe(
      "https://games.mgz.dev/g/limits/card.jpg"
    );
  });

  it("joins against a url without a trailing slash", () => {
    expect(resolveCardImageUrl("https://games.mgz.dev/g/limits", "card.jpg")).toBe(
      "https://games.mgz.dev/g/limits/card.jpg"
    );
  });
});

describe("generateSocialTags", () => {
  const image: SocialCardImage = {
    fileName: "card.jpg",
    width: 1200,
    height: 630,
    mimeType: "image/jpeg",
    bytes: 12345
  };

  it("emits the full tag set when an image is present", () => {
    const tags = generateSocialTags(
      "LIMITS",
      {
        url: "https://games.mgz.dev/g/limits/",
        description: "The world runs on 16k of ram",
        siteName: "mgz.dev games",
        twitterHandle: "thecodetherapy",
        imageAlt: "Isometric arena of glowing tiles",
        themeColor: "#0a0a14",
        locale: "en_US"
      },
      image
    );

    expect(tags).toContain('<meta name="description" content="The world runs on 16k of ram">');
    expect(tags).toContain('<link rel="canonical" href="https://games.mgz.dev/g/limits/">');
    expect(tags).toContain('<meta name="theme-color" content="#0a0a14">');
    expect(tags).toContain('<meta property="og:title" content="LIMITS">');
    expect(tags).toContain('<meta property="og:type" content="website">');
    expect(tags).toContain('<meta property="og:url" content="https://games.mgz.dev/g/limits/">');
    expect(tags).toContain('<meta property="og:site_name" content="mgz.dev games">');
    expect(tags).toContain('<meta property="og:locale" content="en_US">');
    expect(tags).toContain('<meta property="og:image" content="https://games.mgz.dev/g/limits/card.jpg">');
    expect(tags).toContain('<meta property="og:image:width" content="1200">');
    expect(tags).toContain('<meta property="og:image:height" content="630">');
    expect(tags).toContain('<meta property="og:image:type" content="image/jpeg">');
    expect(tags).toContain('<meta property="og:image:alt" content="Isometric arena of glowing tiles">');
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(tags).toContain('<meta name="twitter:title" content="LIMITS">');
    expect(tags).toContain('<meta name="twitter:image" content="https://games.mgz.dev/g/limits/card.jpg">');
    expect(tags).toContain('<meta name="twitter:site" content="@thecodetherapy">');
  });

  it("degrades to a summary card without an image", () => {
    const tags = generateSocialTags("LIMITS", { url: "https://games.mgz.dev/g/limits/" });
    expect(tags).toContain('<meta name="twitter:card" content="summary">');
    expect(tags).not.toContain("og:image");
    expect(tags).not.toContain("twitter:image");
  });

  it("keeps an already prefixed twitter handle intact", () => {
    const tags = generateSocialTags(undefined, {
      url: "https://games.mgz.dev/g/limits/",
      twitterHandle: "@thecodetherapy"
    });
    expect(tags).toContain('<meta name="twitter:site" content="@thecodetherapy">');
    expect(tags).not.toContain("@@");
  });

  it("escapes attribute values", () => {
    const tags = generateSocialTags('He said "play" <now> & more', { url: "https://games.mgz.dev/g/limits/" });
    expect(tags).toContain("He said &quot;play&quot; &lt;now&gt; &amp; more");
    expect(tags).not.toContain('content="He said "play"');
  });

  it("omits optional tags that have no value", () => {
    const tags = generateSocialTags(undefined, { url: "https://games.mgz.dev/g/limits/" });
    expect(tags).not.toContain("og:title");
    expect(tags).not.toContain("og:site_name");
    expect(tags).not.toContain("og:locale");
    expect(tags).not.toContain("theme-color");
    expect(tags).not.toContain("twitter:site");
    expect(tags).not.toContain('name="description"');
  });
});

describe("processScreenshot", () => {
  it("resizes to the default card size as jpeg", async () => {
    const source = await writeFixtureScreenshot(tmpDir);
    const result = await processScreenshot(source, tmpDir);

    expect(result.fileName).toBe("card.jpg");
    expect(result.mimeType).toBe("image/jpeg");
    const written = path.join(tmpDir, "card.jpg");
    expect(fs.existsSync(written)).toBe(true);
    const meta = await sharp(written).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
    expect(meta.format).toBe("jpeg");
    expect(result.bytes).toBe(fs.statSync(written).size);
  });

  it("supports webp output with custom dimensions", async () => {
    const source = await writeFixtureScreenshot(tmpDir);
    const result = await processScreenshot(source, tmpDir, { format: "webp", width: 768, height: 432, quality: 70 });

    expect(result.fileName).toBe("card.webp");
    expect(result.mimeType).toBe("image/webp");
    const meta = await sharp(path.join(tmpDir, "card.webp")).metadata();
    expect(meta.width).toBe(768);
    expect(meta.height).toBe(432);
    expect(meta.format).toBe("webp");
  });

  it("honors a custom file name", async () => {
    const source = await writeFixtureScreenshot(tmpDir);
    const result = await processScreenshot(source, tmpDir, { fileName: "limits-card.jpg" });
    expect(result.fileName).toBe("limits-card.jpg");
    expect(fs.existsSync(path.join(tmpDir, "limits-card.jpg"))).toBe(true);
  });
});

describe("postProcessingPlugin social integration", () => {
  function fakeConfig(root: string, outDir: string): { root: string; build: { outDir: string } } {
    return { root, build: { outDir } };
  }

  function writeBundledHtml(dir: string): void {
    fs.writeFileSync(
      path.join(dir, "index.html"),
      "<html><head><style>body{margin:0}</style></head><body><script>console.log(1)</script></body></html>"
    );
  }

  it("injects tags and writes the card sidecar", async () => {
    const outDir = path.join(tmpDir, "dist");
    fs.mkdirSync(outDir);
    writeBundledHtml(outDir);
    await writeFixtureScreenshot(tmpDir);

    const plugin = postProcessingPlugin({
      titleString: "LIMITS",
      social: { url: "https://games.mgz.dev/g/limits/", description: "16k of ram" }
    });
    (plugin.configResolved as unknown as (config: unknown) => void)(fakeConfig(tmpDir, "dist"));
    await (plugin.closeBundle as unknown as () => Promise<void>)();

    const html = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
    expect(html).toContain('<meta property="og:image" content="https://games.mgz.dev/g/limits/card.jpg">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(fs.existsSync(path.join(outDir, "card.jpg"))).toBe(true);
  });

  it("emits text-only tags and warns when the screenshot is missing", async () => {
    const outDir = path.join(tmpDir, "dist");
    fs.mkdirSync(outDir);
    writeBundledHtml(outDir);

    const plugin = postProcessingPlugin({
      titleString: "LIMITS",
      social: { url: "https://games.mgz.dev/g/limits/", description: "16k of ram" }
    });
    (plugin.configResolved as unknown as (config: unknown) => void)(fakeConfig(tmpDir, "dist"));
    await (plugin.closeBundle as unknown as () => Promise<void>)();

    const html = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
    expect(html).toContain('<meta name="twitter:card" content="summary">');
    expect(html).not.toContain("og:image");
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("social tags will carry no image"));
  });

  it("warns when a screenshot exists without social options", async () => {
    const outDir = path.join(tmpDir, "dist");
    fs.mkdirSync(outDir);
    writeBundledHtml(outDir);
    await writeFixtureScreenshot(tmpDir);

    const plugin = postProcessingPlugin({ titleString: "LIMITS" });
    (plugin.configResolved as unknown as (config: unknown) => void)(fakeConfig(tmpDir, "dist"));
    await (plugin.closeBundle as unknown as () => Promise<void>)();

    const html = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
    expect(html).not.toContain("og:");
    expect(fs.existsSync(path.join(outDir, "card.jpg"))).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("no social options"));
  });
});
