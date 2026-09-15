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
    expect(html).not.toContain("ownership-notice");
    expect(html).not.toContain('name="copyright"');
    expect(html).not.toContain('rel="license"');
    expect(inflateScript(html)).toBe(SCRIPT);
  });

  it("writes the notice as hidden text before the comment, so a reader that drops comments still finds it", async () => {
    const html = await runPlugin({ notice: NOTICE });
    const hidden = `<pre id="ownership-notice" hidden>${NOTICE}</pre>`;
    expect(html).toContain(hidden);
    expect(html.indexOf(hidden)).toBeGreaterThan(html.indexOf("</head>"));
    expect(html.indexOf(hidden)).toBeLessThan(html.indexOf("<!--"));
  });

  it("names the notice in the head with a copyright line and a license link to the hidden text", async () => {
    const html = await runPlugin({ notice: NOTICE });
    expect(html).toContain('<meta name="copyright" content="TANKZ is Copyright (c) 2026 Marco Gomez.">');
    expect(html).toContain('<link rel="license" href="#ownership-notice">');
    expect(html.indexOf('name="copyright"')).toBeLessThan(html.indexOf("</head>"));
  });

  it("takes the notice's first line as the copyright when no line names one", async () => {
    const html = await runPlugin({ notice: "All rights reserved.\nNo copying." });
    expect(html).toContain('<meta name="copyright" content="All rights reserved.">');
  });

  it("escapes markup inside the notice's hidden text and copyright line", async () => {
    const html = await runPlugin({ notice: 'Copyright <b>"me" & co</b>' });
    expect(html).toContain('<pre id="ownership-notice" hidden>Copyright &lt;b&gt;&quot;me&quot; &amp; co&lt;/b&gt;</pre>');
    expect(html).toContain('<meta name="copyright" content="Copyright &lt;b&gt;&quot;me&quot; &amp; co&lt;/b&gt;">');
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
