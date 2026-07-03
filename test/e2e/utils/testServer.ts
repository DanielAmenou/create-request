import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";

/**
 * A request as it arrived on the wire, recorded for assertions.
 */
export type RecordedRequest = {
  method: string;
  /** Pathname only (no query string) */
  path: string;
  query: URLSearchParams;
  /** Raw Node headers (names lowercased, values joined by Node) */
  headers: NodeJS.Dict<string | string[]>;
  /** Raw request body bytes */
  body: Buffer;
  /** Request body decoded as UTF-8 */
  text: string;
};

/**
 * A real local HTTP server for end-to-end tests.
 * Unlike the mocked suite, requests made against this server exercise real sockets,
 * real redirects, real chunked transfer, real compression and real timing.
 *
 * Routes:
 * - ANY  /echo                     → JSON snapshot of the request (method, path, query, headers, body)
 * - GET  /json                     → { "message": "hello", "source": "e2e" }
 * - GET  /text                     → plain text
 * - GET  /empty                    → 204, no body
 * - GET  /binary?size=N            → N deterministic bytes (application/octet-stream)
 * - ANY  /status/{code}            → responds with that status and a JSON error body
 * - GET  /flaky/{key}?fails=N      → 500 for the first N requests per key, then 200
 * - GET  /slow?ms=N                → responds after N milliseconds
 * - GET  /stream?chunks=N&delay=ms → chunked body, one chunk every `delay` ms
 * - GET  /gzip                     → gzip-encoded JSON (Content-Encoding: gzip)
 * - GET  /redirect?n=N             → 302 chain of N hops ending at /json
 * - GET  /set-cookie               → sets two cookies via Set-Cookie
 * - GET  /never                    → never responds (for abort tests)
 * - ANY  other                     → 404 JSON body
 */
export class TestServer {
  public readonly requests: RecordedRequest[] = [];
  private readonly server: Server;
  private readonly flakyHits = new Map<string, number>();
  private port = 0;

  private constructor() {
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
  }

  /** Starts a server on an ephemeral port on 127.0.0.1 */
  static async start(): Promise<TestServer> {
    const instance = new TestServer();
    await new Promise<void>((resolve, reject) => {
      instance.server.once("error", reject);
      instance.server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = instance.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Failed to determine test server port");
    }
    instance.port = address.port;
    return instance;
  }

  /** Base origin, e.g. "http://127.0.0.1:49152" */
  get origin(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Builds an absolute URL for a path on this server */
  url(path: string): string {
    return `${this.origin}${path}`;
  }

  /** The most recently received request */
  get lastRequest(): RecordedRequest {
    const last = this.requests[this.requests.length - 1];
    if (!last) throw new Error("No requests were received by the test server");
    return last;
  }

  /** Clears recorded requests and flaky-route state (call between tests) */
  reset(): void {
    this.requests.length = 0;
    this.flakyHits.clear();
  }

  /** Stops the server, destroying any open connections */
  async close(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      this.server.close(error => (error ? reject(error) : resolve()));
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestUrl = new URL(req.url ?? "/", this.origin);
    const body = await readBody(req);

    const recorded: RecordedRequest = {
      method: req.method ?? "GET",
      path: requestUrl.pathname,
      query: requestUrl.searchParams,
      headers: req.headers,
      body,
      text: body.toString("utf8"),
    };
    this.requests.push(recorded);

    const route = requestUrl.pathname;

    if (route === "/echo") {
      return sendJson(res, 200, {
        method: recorded.method,
        path: recorded.path,
        query: Object.fromEntries(requestUrl.searchParams),
        headers: singleValueHeaders(req.headers),
        body: recorded.text,
        bodyBase64: body.toString("base64"),
      });
    }

    if (route === "/json") {
      return sendJson(res, 200, { message: "hello", source: "e2e" });
    }

    if (route === "/text") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("plain text response");
      return;
    }

    if (route === "/empty") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (route === "/binary") {
      const size = Number(requestUrl.searchParams.get("size") ?? 256);
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(deterministicBytes(size));
      return;
    }

    if (route.startsWith("/status/")) {
      const status = Number(route.slice("/status/".length));
      if (status === 204 || status === 304) {
        res.writeHead(status);
        res.end();
        return;
      }
      return sendJson(res, status, { error: `status ${status}`, code: status });
    }

    if (route.startsWith("/flaky/")) {
      const key = route.slice("/flaky/".length);
      const failures = Number(requestUrl.searchParams.get("fails") ?? 1);
      const hits = (this.flakyHits.get(key) ?? 0) + 1;
      this.flakyHits.set(key, hits);
      if (hits <= failures) {
        return sendJson(res, 500, { error: "flaky failure", hit: hits });
      }
      return sendJson(res, 200, { ok: true, hits });
    }

    if (route === "/slow") {
      const ms = Number(requestUrl.searchParams.get("ms") ?? 200);
      const timer = setTimeout(() => sendJson(res, 200, { slept: ms }), ms);
      res.once("close", () => clearTimeout(timer));
      return;
    }

    if (route === "/stream") {
      const chunks = Number(requestUrl.searchParams.get("chunks") ?? 3);
      const delay = Number(requestUrl.searchParams.get("delay") ?? 10);
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      let sent = 0;
      const timer = setInterval(() => {
        sent += 1;
        res.write(`chunk-${sent};`);
        if (sent >= chunks) {
          clearInterval(timer);
          res.end();
        }
      }, delay);
      res.once("close", () => clearInterval(timer));
      return;
    }

    if (route === "/gzip") {
      const compressed = gzipSync(JSON.stringify({ compressed: true, message: "gzipped hello" }));
      res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
      res.end(compressed);
      return;
    }

    if (route === "/redirect") {
      const remaining = Number(requestUrl.searchParams.get("n") ?? 1);
      const target = remaining > 1 ? `/redirect?n=${remaining - 1}` : "/json";
      res.writeHead(302, { location: this.url(target) });
      res.end();
      return;
    }

    if (route === "/set-cookie") {
      res.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": ["sessionId=abc123; HttpOnly; Path=/", "theme=dark; Path=/"],
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (route === "/never") {
      // Intentionally never respond; the connection is destroyed on close()
      return;
    }

    return sendJson(res, 404, { error: "not found", path: route });
  }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(chunk as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function singleValueHeaders(headers: NodeJS.Dict<string | string[]>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    result[name] = Array.isArray(value) ? value.join(", ") : value;
  }
  return result;
}

/** Deterministic byte pattern so tests can verify binary integrity */
export function deterministicBytes(size: number): Buffer {
  const bytes = Buffer.alloc(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 7 + 13) % 256;
  return bytes;
}
