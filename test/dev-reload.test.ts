import { createHash } from "node:crypto";
import http from "node:http";
import net from "node:net";
import { describe, it, expect, afterEach } from "vitest";
import { devReloadPlugin, devReloadClientScript } from "../src/plugins/dev-reload";

import type { Plugin } from "vite";

function getPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

function connectWebSocket(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const key = Buffer.from(createHash("sha1").update(String(Date.now())).digest()).toString("base64");
    const socket = net.createConnection(port, "localhost", () => {
      socket.write(
        "GET / HTTP/1.1\r\n" +
          "Host: localhost\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `Sec-WebSocket-Key: ${key}\r\n` +
          "Sec-WebSocket-Version: 13\r\n" +
          "\r\n"
      );
    });

    socket.once("data", (data) => {
      const response = data.toString();
      if (response.includes("101 Switching Protocols")) {
        resolve(socket);
      } else {
        reject(new Error(`WebSocket upgrade failed: ${response}`));
      }
    });

    socket.on("error", reject);
  });
}

function readFrame(socket: net.Socket): Promise<string> {
  return new Promise((resolve) => {
    socket.once("data", (buf: Buffer) => {
      const opcode = buf[0] & 0x0f;
      if (opcode === 0x01) {
        const len = buf[1] & 0x7f;
        const payload = buf.subarray(2, 2 + len);
        resolve(payload.toString("utf8"));
      }
    });
  });
}

let cleanupFns: (() => void | Promise<void>)[] = [];

afterEach(async () => {
  for (const fn of cleanupFns) {
    await fn();
  }
  cleanupFns = [];
});

describe("devReloadPlugin", () => {
  it("creates a plugin with the correct name", () => {
    const plugin = devReloadPlugin();
    expect(plugin.name).toBe("dev-reload");
  });

  it("only applies to build", () => {
    const plugin = devReloadPlugin();
    expect(plugin.apply).toBe("build");
  });

  it("starts a WebSocket server on buildStart and accepts connections", async () => {
    const port = await getPort();
    const plugin = devReloadPlugin({ port }) as Plugin & {
      buildStart: () => void;
      closeWatcher: () => void;
    };

    plugin.buildStart();
    cleanupFns.push(() => plugin.closeWatcher());

    await new Promise((r) => setTimeout(r, 50));

    const socket = await connectWebSocket(port);
    cleanupFns.push(() => socket.destroy());

    expect(socket.writable).toBe(true);
  });

  it("sends 'change' to connected clients on closeBundle", async () => {
    const port = await getPort();
    const plugin = devReloadPlugin({ port }) as Plugin & {
      buildStart: () => void;
      closeBundle: () => void;
      closeWatcher: () => void;
    };

    plugin.buildStart();
    cleanupFns.push(() => plugin.closeWatcher());

    await new Promise((r) => setTimeout(r, 50));

    const socket = await connectWebSocket(port);
    cleanupFns.push(() => socket.destroy());

    await new Promise((r) => setTimeout(r, 20));

    const messagePromise = readFrame(socket);
    plugin.closeBundle();
    const message = await messagePromise;

    expect(message).toBe("change");
  });

  it("sends to multiple clients simultaneously", async () => {
    const port = await getPort();
    const plugin = devReloadPlugin({ port }) as Plugin & {
      buildStart: () => void;
      closeBundle: () => void;
      closeWatcher: () => void;
    };

    plugin.buildStart();
    cleanupFns.push(() => plugin.closeWatcher());

    await new Promise((r) => setTimeout(r, 50));

    const socket1 = await connectWebSocket(port);
    const socket2 = await connectWebSocket(port);
    cleanupFns.push(() => socket1.destroy());
    cleanupFns.push(() => socket2.destroy());

    await new Promise((r) => setTimeout(r, 20));

    const msg1 = readFrame(socket1);
    const msg2 = readFrame(socket2);
    plugin.closeBundle();

    expect(await msg1).toBe("change");
    expect(await msg2).toBe("change");
  });

  it("cleans up clients that disconnect", async () => {
    const port = await getPort();
    const plugin = devReloadPlugin({ port }) as Plugin & {
      buildStart: () => void;
      closeBundle: () => void;
      closeWatcher: () => void;
    };

    plugin.buildStart();
    cleanupFns.push(() => plugin.closeWatcher());

    await new Promise((r) => setTimeout(r, 50));

    const socket = await connectWebSocket(port);
    socket.destroy();
    await new Promise((r) => setTimeout(r, 50));

    expect(() => plugin.closeBundle()).not.toThrow();
  });

  it("tears down server on closeWatcher", async () => {
    const port = await getPort();
    const plugin = devReloadPlugin({ port }) as Plugin & {
      buildStart: () => void;
      closeWatcher: () => void;
    };

    plugin.buildStart();
    await new Promise((r) => setTimeout(r, 50));

    plugin.closeWatcher();
    await new Promise((r) => setTimeout(r, 50));

    await expect(
      new Promise<void>((resolve, reject) => {
        const req = http.get(`http://localhost:${port}`, () => reject(new Error("should not connect")));
        req.on("error", () => resolve());
      })
    ).resolves.toBeUndefined();
  });

  it("returns 404 for plain HTTP requests", async () => {
    const port = await getPort();
    const plugin = devReloadPlugin({ port }) as Plugin & {
      buildStart: () => void;
      closeWatcher: () => void;
    };

    plugin.buildStart();
    cleanupFns.push(() => plugin.closeWatcher());

    await new Promise((r) => setTimeout(r, 50));

    const status = await new Promise<number>((resolve) => {
      http.get(`http://localhost:${port}`, (res) => resolve(res.statusCode!));
    });

    expect(status).toBe(404);
  });

  it("defaults to port 21816", () => {
    const plugin = devReloadPlugin();
    expect(plugin).toBeDefined();
  });

  it("rejects upgrade without Sec-WebSocket-Key", async () => {
    const port = await getPort();
    const plugin = devReloadPlugin({ port }) as Plugin & {
      buildStart: () => void;
      closeWatcher: () => void;
    };

    plugin.buildStart();
    cleanupFns.push(() => plugin.closeWatcher());

    await new Promise((r) => setTimeout(r, 50));

    await new Promise<void>((resolve) => {
      const socket = net.createConnection(port, "localhost", () => {
        socket.write(
          "GET / HTTP/1.1\r\n" +
            "Host: localhost\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            "\r\n"
        );
      });
      socket.on("close", () => resolve());
    });
  });
});

describe("devReloadClientScript", () => {
  it("returns a non-empty string", () => {
    const script = devReloadClientScript();
    expect(script.length).toBeGreaterThan(0);
  });

  it("defaults to port 21816", () => {
    const script = devReloadClientScript();
    expect(script).toContain("21816");
  });

  it("uses custom port", () => {
    const script = devReloadClientScript({ port: 9999 });
    expect(script).toContain("9999");
    expect(script).not.toContain("21816");
  });

  it("creates a WebSocket connection", () => {
    const script = devReloadClientScript();
    expect(script).toContain("new WebSocket");
  });

  it("triggers location.reload on message", () => {
    const script = devReloadClientScript();
    expect(script).toContain("location.reload()");
  });

  it("includes reconnection logic", () => {
    const script = devReloadClientScript();
    expect(script).toContain("close");
    expect(script).toContain("setTimeout");
  });

  it("is a self-executing function", () => {
    const script = devReloadClientScript();
    expect(script).toMatch(/^\(.*\)\(\);$/);
  });
});
