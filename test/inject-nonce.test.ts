import { describe, it, expect } from "vitest";
import { injectNoncePlugin } from "../src/plugins/inject-nonce";

function transform(plugin: ReturnType<typeof injectNoncePlugin>, html: string): string {
  return (plugin.transformIndexHtml as Function)(html);
}

describe("injectNoncePlugin", () => {
  const cspMeta = '<meta http-equiv="Content-Security-Policy" content="script-src \'self\'">';

  it("adds nonce attribute to all script tags", () => {
    const plugin = injectNoncePlugin();
    const html = `<html><head>${cspMeta}</head><body><script>alert(1)</script></body></html>`;
    const result = transform(plugin, html);
    expect(result).toMatch(/<script nonce="[A-Za-z0-9+/]+=*">/);
  });

  it("adds nonce to multiple script tags", () => {
    const plugin = injectNoncePlugin();
    const html = `<html><head>${cspMeta}</head><body><script>a()</script><script>b()</script></body></html>`;
    const result = transform(plugin, html);
    const matches = result.match(/nonce="/g);
    expect(matches).toHaveLength(2);
  });

  it("preserves existing script attributes", () => {
    const plugin = injectNoncePlugin();
    const html = `<html><head>${cspMeta}</head><body><script type="module" defer>x()</script></body></html>`;
    const result = transform(plugin, html);
    expect(result).toMatch(/type="module"/);
    expect(result).toMatch(/defer/);
    expect(result).toMatch(/nonce="/);
  });

  it("uses the same nonce for all scripts and CSP meta", () => {
    const plugin = injectNoncePlugin();
    const html = `<html><head>${cspMeta}</head><body><script>a()</script><script>b()</script></body></html>`;
    const result = transform(plugin, html);
    const nonceMatches = result.match(/nonce="([^"]+)"/g) || [];
    const nonces = nonceMatches.map((m) => m.replace(/nonce="([^"]+)"/, "$1"));
    expect(new Set(nonces).size).toBe(1);
  });

  it("updates CSP meta tag with nonce value", () => {
    const plugin = injectNoncePlugin();
    const html = `<html><head>${cspMeta}</head><body><script>x()</script></body></html>`;
    const result = transform(plugin, html);
    expect(result).toMatch(/script-src 'self' 'unsafe-eval' blob: 'nonce-/);
  });

  it("includes worker-src directive in updated CSP", () => {
    const plugin = injectNoncePlugin();
    const html = `<html><head>${cspMeta}</head><body></body></html>`;
    const result = transform(plugin, html);
    expect(result).toMatch(/worker-src 'self' blob:/);
  });

  it("generates a different nonce on each plugin instantiation", () => {
    const plugin1 = injectNoncePlugin();
    const plugin2 = injectNoncePlugin();
    const html = `<html><head>${cspMeta}</head><body><script>x()</script></body></html>`;
    const result1 = transform(plugin1, html);
    const result2 = transform(plugin2, html);
    const nonce1 = result1.match(/nonce="([^"]+)"/)?.[1];
    const nonce2 = result2.match(/nonce="([^"]+)"/)?.[1];
    expect(nonce1).toBeDefined();
    expect(nonce2).toBeDefined();
    expect(nonce1).not.toBe(nonce2);
  });

  it("removes CSP meta tag in dev mode", () => {
    const plugin = injectNoncePlugin({ isDevMode: true });
    const html = `<html><head>${cspMeta}</head><body><script>x()</script></body></html>`;
    const result = transform(plugin, html);
    expect(result).not.toMatch(/Content-Security-Policy/);
  });

  it("still adds nonce to scripts in dev mode", () => {
    const plugin = injectNoncePlugin({ isDevMode: true });
    const html = `<html><head>${cspMeta}</head><body><script>x()</script></body></html>`;
    const result = transform(plugin, html);
    expect(result).toMatch(/nonce="/);
  });

  it("handles HTML without CSP meta tag gracefully", () => {
    const plugin = injectNoncePlugin();
    const html = "<html><head></head><body><script>x()</script></body></html>";
    const result = transform(plugin, html);
    expect(result).toMatch(/nonce="/);
    expect(result).not.toMatch(/Content-Security-Policy/);
  });
});
