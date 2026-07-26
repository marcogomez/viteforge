import fs from "fs";
import path from "path";

/** Options for the social card screenshot pipeline. */
export interface SocialScreenshotOptions {
  /**
   * Source image path, relative to the app root
   * @default "screenshot.png"
   */
  source?: string;
  /**
   * Card width in pixels
   * @default 1200
   */
  width?: number;
  /**
   * Card height in pixels
   * @default 630
   */
  height?: number;
  /**
   * Output format. JPEG is the safe choice because every scraper supports it.
   * WebP is smaller but Facebook's scraper does not accept it
   * @default "jpeg"
   */
  format?: "jpeg" | "webp";
  /**
   * Encoder quality (1-100)
   * @default 80
   */
  quality?: number;
  /**
   * File name of the emitted sidecar image
   * @default "card.jpg" for jpeg, "card.webp" for webp
   */
  fileName?: string;
}

/** Social card metadata injected into the built HTML head. */
export interface SocialOptions {
  /**
   * Absolute URL where the built game will be hosted. Scrapers resolve the
   * card image against this, so image tags are only emitted when it is set.
   * A data URI cannot be used: crawlers reject inlined og:image values,
   * which is why the card is a sidecar file next to the HTML
   */
  url: string;
  /**
   * Description used for the description, og:description and
   * twitter:description tags
   */
  description?: string;
  /** Site name for og:site_name */
  siteName?: string;
  /** Handle for twitter:site, with or without the leading @ */
  twitterHandle?: string;
  /** Alt text for the card image */
  imageAlt?: string;
  /**
   * Theme color meta tag. Discord also uses it as the embed accent color
   */
  themeColor?: string;
  /** Locale for og:locale, for example en_US */
  locale?: string;
  /** Screenshot resize and compression settings */
  screenshot?: SocialScreenshotOptions;
}

/** Emitted sidecar image details used to build the image meta tags. */
export interface SocialCardImage {
  /** File name of the sidecar image inside the output directory */
  fileName: string;
  /** Final width in pixels */
  width: number;
  /** Final height in pixels */
  height: number;
  /** Mime type for og:image:type */
  mimeType: string;
  /** Encoded size in bytes */
  bytes: number;
}

/** Escapes a string for use inside a double quoted HTML attribute. */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Builds one meta tag with escaped attribute values. */
function metaTag(attribute: "property" | "name", key: string, value: string): string {
  return `<meta ${attribute}="${key}" content="${escapeAttribute(value)}">`;
}

/** Resolves the absolute URL of the card image against the hosted page URL. */
export function resolveCardImageUrl(baseUrl: string, fileName: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(fileName, base).href;
}

/**
 * Generates the social meta tag block: description, canonical link, theme
 * color, Open Graph and Twitter card tags. Image tags are included only when
 * a processed card image is provided. Without an image the Twitter card
 * degrades from summary_large_image to summary, which still renders a plain
 * link card.
 */
export function generateSocialTags(title: string | undefined, social: SocialOptions, image?: SocialCardImage): string {
  const tags: string[] = [];

  if (social.description !== undefined) {
    tags.push(metaTag("name", "description", social.description));
  }
  tags.push(`<link rel="canonical" href="${escapeAttribute(social.url)}">`);
  if (social.themeColor !== undefined) {
    tags.push(metaTag("name", "theme-color", social.themeColor));
  }

  if (title !== undefined) {
    tags.push(metaTag("property", "og:title", title));
  }
  if (social.description !== undefined) {
    tags.push(metaTag("property", "og:description", social.description));
  }
  tags.push(metaTag("property", "og:type", "website"));
  tags.push(metaTag("property", "og:url", social.url));
  if (social.siteName !== undefined) {
    tags.push(metaTag("property", "og:site_name", social.siteName));
  }
  if (social.locale !== undefined) {
    tags.push(metaTag("property", "og:locale", social.locale));
  }
  if (image !== undefined) {
    const imageUrl = resolveCardImageUrl(social.url, image.fileName);
    tags.push(metaTag("property", "og:image", imageUrl));
    tags.push(metaTag("property", "og:image:width", String(image.width)));
    tags.push(metaTag("property", "og:image:height", String(image.height)));
    tags.push(metaTag("property", "og:image:type", image.mimeType));
    if (social.imageAlt !== undefined) {
      tags.push(metaTag("property", "og:image:alt", social.imageAlt));
    }
  }

  tags.push(metaTag("name", "twitter:card", image !== undefined ? "summary_large_image" : "summary"));
  if (title !== undefined) {
    tags.push(metaTag("name", "twitter:title", title));
  }
  if (social.description !== undefined) {
    tags.push(metaTag("name", "twitter:description", social.description));
  }
  if (image !== undefined) {
    tags.push(metaTag("name", "twitter:image", resolveCardImageUrl(social.url, image.fileName)));
    if (social.imageAlt !== undefined) {
      tags.push(metaTag("name", "twitter:image:alt", social.imageAlt));
    }
  }
  if (social.twitterHandle !== undefined) {
    const handle = social.twitterHandle.startsWith("@") ? social.twitterHandle : `@${social.twitterHandle}`;
    tags.push(metaTag("name", "twitter:site", handle));
  }

  return tags.join("");
}

/**
 * Resizes and compresses the screenshot into the card sidecar image using
 * sharp, which is an optional peer dependency: the build fails with an
 * actionable message when a screenshot exists but sharp is not installed.
 * The resize is a center crop, so a 16:9 screenshot loses a sliver of top
 * and bottom when targeting the 1.91:1 card default.
 */
export async function processScreenshot(
  sourcePath: string,
  outDir: string,
  options: SocialScreenshotOptions = {}
): Promise<SocialCardImage> {
  let sharp: typeof import("sharp");
  try {
    // sharp is cjs, so the callable lands on default under esm and on the
    // namespace itself under cjs. both shapes are handled here
    const mod = (await import("sharp")) as { default?: typeof import("sharp") };
    sharp = mod.default ?? (mod as unknown as typeof import("sharp"));
  } catch {
    throw new Error(
      "[post-processing] social card generation needs sharp. Install it as a dev dependency: pnpm add -D sharp"
    );
  }

  const width = options.width ?? 1200;
  const height = options.height ?? 630;
  const format = options.format ?? "jpeg";
  const quality = options.quality ?? 80;
  const fileName = options.fileName ?? (format === "webp" ? "card.webp" : "card.jpg");

  const pipeline = sharp(sourcePath).resize(width, height, { fit: "cover", position: "centre" });
  const buffer =
    format === "webp"
      ? await pipeline.webp({ quality, effort: 6 }).toBuffer()
      : await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();

  fs.writeFileSync(path.join(outDir, fileName), buffer);

  return {
    fileName,
    width,
    height,
    mimeType: format === "webp" ? "image/webp" : "image/jpeg",
    bytes: buffer.length
  };
}
