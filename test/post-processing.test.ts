import fs from "fs";
import os from "os";
import { inflate } from "pako";
import path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { postProcessingPlugin } from "../src/plugins/post-processing";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "post-processing-test-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  vi.restoreAllMocks();
});

const NOTICE =
  "NOTICE\n\nTANKZ is Copyright (c) 2026 Marco Gomez.\nAll rights reserved.\n\nLicensing enquiries: marco@mgz.dev";
const SCRIPT = "console.log(1)";

function fakeConfig(root: string, outDir: string): { root: string; build: { outDir: string } } {
  return { root, build: { outDir } };
}

/** Stand a bundled html in dist and run the plugin over it, returning the final html. */
async function runPlugin(options: Parameters<typeof postProcessingPlugin>[0]): Promise<string> {
  const outDir = path.join(tmpDir, "dist");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "index.html"),
    `<html><head><style>body{margin:0}</style></head><body><script>${SCRIPT}</script></body></html>`
  );
  const plugin = postProcessingPlugin(options);
  (plugin.configResolved as unknown as (config: unknown) => void)(fakeConfig(tmpDir, "dist"));
  await (plugin.closeBundle as unknown as () => Promise<void>)();
  return fs.readFileSync(path.join(outDir, "index.html"), "utf8");
}

/** the script the browser would run, inflated back out of the bootstrap's base64 blob */
function inflateScript(html: string): string {
  const match = /var c="([^"]+)"/.exec(html);
  if (match === null) {
    throw new Error("no compressed blob in the html");
  }
  return inflate(Buffer.from(match[1], "base64"), { to: "string", raw: true });
}

describe("postProcessingPlugin", () => {
  it("compresses the scripts into a self-extracting page", async () => {
    const html = await runPlugin({ titleString: "TANKZ" });
    expect(html).toContain("<title>TANKZ</title>");
    expect(html).toContain("DecompressionStream");
    expect(inflateScript(html)).toBe(SCRIPT);
  });

  it("ships no notice when none is given and no NOTICE.txt exists", async () => {
    const html = await runPlugin({});
    expect(html).not.toContain("<!--");
    expect(inflateScript(html)).toBe(SCRIPT);
  });

  it("writes a notice string as an html comment before the bootstrap and as a header on the script", async () => {
    const html = await runPlugin({ notice: NOTICE });
    const comment = `<!--\n${NOTICE}\n-->`;
    expect(html).toContain(comment);
    expect(html.indexOf(comment)).toBeLessThan(html.indexOf("<script>"));
    expect(html.indexOf(comment)).toBeGreaterThan(html.indexOf("</head>"));
    // the notice keeps its lines while the rest of the page is one line
    const afterNotice = html.slice(html.indexOf("-->") + 3);
    expect(afterNotice).not.toContain("\n");
    expect(inflateScript(html)).toBe(`/*!\n${NOTICE}\n*/\n${SCRIPT}`);
  });

  it("reads NOTICE.txt from the app root on its own", async () => {
    fs.writeFileSync(path.join(tmpDir, "NOTICE.txt"), `${NOTICE}\n`);
    const html = await runPlugin({});
    expect(html).toContain(`<!--\n${NOTICE}\n-->`);
    expect(inflateScript(html)).toBe(`/*!\n${NOTICE}\n*/\n${SCRIPT}`);
  });

  it("reads a named notice file relative to the app root", async () => {
    fs.mkdirSync(path.join(tmpDir, "legal"));
    fs.writeFileSync(path.join(tmpDir, "legal", "terms.txt"), "All rights reserved.");
    const html = await runPlugin({ notice: { file: "legal/terms.txt" } });
    expect(html).toContain("<!--\nAll rights reserved.\n-->");
    expect(inflateScript(html)).toBe(`/*!\nAll rights reserved.\n*/\n${SCRIPT}`);
  });

  it("warns and ships no notice when the named file is missing", async () => {
    const html = await runPlugin({ notice: { file: "missing.txt" } });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("missing.txt"));
    expect(html).not.toContain("<!--");
    expect(inflateScript(html)).toBe(SCRIPT);
  });

  it("disarms a comment terminator and a double dash inside the notice", async () => {
    const html = await runPlugin({ notice: "ends */ here -- and there" });
    expect(html).toContain("<!--\nends */ here - - and there\n-->");
    expect(inflateScript(html)).toBe(`/*!\nends * / here -- and there\n*/\n${SCRIPT}`);
  });

  it("ships no notice for a blank notice", async () => {
    const html = await runPlugin({ notice: "  \n " });
    expect(html).not.toContain("<!--");
    expect(inflateScript(html)).toBe(SCRIPT);
  });
});
