import { createHash } from "node:crypto";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";

import type { Duplex } from "node:stream";
import type { Plugin } from "vite";

export interface DevReloadPluginOptions {
  /**
   * Port for the WebSocket server that notifies clients of rebuilds.
   * @default 21816
   */
  port?: number;
}

interface WebSocketClient {
  socket: Duplex;
  alive: boolean;
}

function sendFrame(socket: Duplex, data: string): void {
  const payload = Buffer.from(data, "utf8");
  const len = payload.length;

  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  }

  socket.write(Buffer.concat([header, payload]));
}

function sendPing(client: WebSocketClient): void {
  try {
    const header = Buffer.alloc(2);
    header[0] = 0x89;
    header[1] = 0;
    client.socket.write(header);
  } catch {
    // socket already dead
  }
}

function handleUpgrade(req: IncomingMessage, socket: Duplex, clients: Set<WebSocketClient>): void {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-5495B35DC04A")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n"
  );

  const client: WebSocketClient = { socket, alive: true };
  clients.add(client);

  socket.on("data", (buf: Buffer) => {
    if (buf.length === 0) {
      return;
    }
    const opcode = buf[0] & 0x0f;
    if (opcode === 0x0a) {
      client.alive = true;
    } else if (opcode === 0x08) {
      clients.delete(client);
      socket.end();
    }
  });

  socket.on("close", () => {
    clients.delete(client);
  });

  socket.on("error", () => {
    clients.delete(client);
  });
}

let sharedServer: Server | null = null;
let sharedClients: Set<WebSocketClient> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Vite plugin that starts a lightweight WebSocket server during `vite build --watch`.
 * When a rebuild completes, all connected browser clients receive a "change" message.
 *
 * Pair with `devReloadClientScript()` to inject the client-side reload snippet.
 */
export function devReloadPlugin(options: DevReloadPluginOptions = {}): Plugin {
  const { port = 21816 } = options;

  return {
    name: "dev-reload",
    apply: "build",

    buildStart() {
      if (sharedServer) {
        return;
      }

      const clients = new Set<WebSocketClient>();
      sharedClients = clients;

      const server = createServer((_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(404);
        res.end();
      });

      server.on("upgrade", (req: IncomingMessage, socket: Duplex) => {
        handleUpgrade(req, socket, clients);
      });

      server.listen(port, () => {
        console.log(`[dev-reload] WebSocket server listening on ws://localhost:${port}`);
      });

      heartbeatInterval = setInterval(() => {
        for (const client of clients) {
          if (!client.alive) {
            clients.delete(client);
            client.socket.destroy();
            continue;
          }
          client.alive = false;
          sendPing(client);
        }
      }, 30000);

      sharedServer = server;
    },

    closeBundle() {
      if (!sharedClients) {
        return;
      }

      for (const client of sharedClients) {
        sendFrame(client.socket, "change");
      }
    },

    closeWatcher() {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      if (sharedServer) {
        sharedServer.close();
        sharedServer = null;
      }
      if (sharedClients) {
        for (const client of sharedClients) {
          client.socket.destroy();
        }
        sharedClients = null;
      }
    }
  };
}

/**
 * Returns a self-executing script snippet that connects to the dev-reload
 * WebSocket server and reloads the page when a rebuild is detected.
 *
 * Inject this into your client HTML during development builds only.
 *
 * @example
 * ```ts
 * // As a Vite banner or script tag
 * const snippet = devReloadClientScript({ port: 21816 });
 * ```
 */
export function devReloadClientScript(options: { port?: number } = {}): string {
  const { port = 21816 } = options;
  // eslint-disable-next-line max-len
  return `(()=>{let s=0;(function c(){const w=new WebSocket("ws://localhost:${port}");w.addEventListener("message",()=>location.reload());w.addEventListener("close",()=>{if(s<5){s++;setTimeout(c,1000)}});w.addEventListener("open",()=>{s=0})})()})();`;
}
