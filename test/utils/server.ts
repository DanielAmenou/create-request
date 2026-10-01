import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";

/**
 * A request as it arrived on the wire, recorded for assertions.
 */
export interface RecordedRequest {
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
}

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
 * - ANY  /status/{code}            → responds with that status and a JSON error body (`?empty=1` sends no body,
 *                                    `?text=1` sends a plain-text body)
 * - POST /graphql                  → 200 with `{ data: { ok, query, variables } }`, or `{ data: null, errors: [...] }` when the
 *                                    query contains "fail" (`"fail-raw"` makes the first error a plain string and the second one a non-string message)
 * - GET  /invalid-json             → 200 application/json whose body is not JSON
 * - GET  /no-type                  → 200 with a body but no Content-Type header
 * - GET  /broken?bytes=N           → announces a 4096-byte body, sends N bytes, then drops the connection (`&status=500` picks the status)
 * - GET  /flaky/{key}?fails=N      → 500 for the first N requests per key, then 200
 *                                    (`status=503` picks the failure status, `retryAfter=1` adds a Retry-After header)
 * - GET  /form                     → application/x-www-form-urlencoded body
 * - GET  /big-error?size=N         → 500 with an N-byte body and a Content-Length header (`&gzip=1` sends it gzip-encoded,
 *                                    with the small compressed Content-Length; `&chunked=1` sends it chunked, without one)
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
      if (status === 204 || status === 304 || requestUrl.searchParams.has("empty")) {
        res.writeHead(status);
        res.end();
        return;
      }
      if (requestUrl.searchParams.has("text")) {
        res.writeHead(status, { "content-type": "text/plain" });
        res.end(`status ${status} as text`);
        return;
      }
      return sendJson(res, status, { error: `status ${status}`, code: status });
    }

    if (route === "/graphql") {
      const { query = "", variables } = JSON.parse(recorded.text || "{}") as { query?: string; variables?: unknown };
      if (query.includes("fail-raw")) return sendJson(res, 200, { data: null, errors: ["Raw failure", { message: { code: "E2" } }] });
      if (query.includes("fail")) return sendJson(res, 200, { data: null, errors: [{ message: "Not found" }, { message: "Forbidden", path: ["me"] }] });
      return sendJson(res, 200, { data: { ok: true, query, variables: variables ?? null } });
    }

    if (route === "/invalid-json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{not json");
      return;
    }

    if (route === "/no-type") {
      res.writeHead(200);
      res.end("untyped");
      return;
    }

    if (route === "/broken") {
      const bytes = Number(requestUrl.searchParams.get("bytes") ?? 16);
      res.writeHead(Number(requestUrl.searchParams.get("status") ?? 200), { "content-type": "application/octet-stream", "content-length": "4096" });
      res.write(Buffer.alloc(bytes, "b"));
      setTimeout(() => res.destroy(), 20);
      return;
    }

    if (route.startsWith("/flaky/")) {
      const key = route.slice("/flaky/".length);
      const failures = Number(requestUrl.searchParams.get("fails") ?? 1);
      const hits = (this.flakyHits.get(key) ?? 0) + 1;
      this.flakyHits.set(key, hits);
      if (hits <= failures) {
        const status = Number(requestUrl.searchParams.get("status") ?? 500);
        const retryAfter = requestUrl.searchParams.get("retryAfter");
        res.writeHead(status, { "content-type": "application/json", ...(retryAfter ? { "retry-after": retryAfter } : {}) });
        res.end(JSON.stringify({ error: "flaky failure", hit: hits }));
        return;
      }
      return sendJson(res, 200, { ok: true, hits });
    }

    if (route === "/form") {
      res.writeHead(200, { "content-type": "application/x-www-form-urlencoded" });
      res.end("a=1&b=two");
      return;
    }

    if (route === "/big-error") {
      const size = Number(requestUrl.searchParams.get("size") ?? 16);
      const body = Buffer.alloc(size, "x");
      if (requestUrl.searchParams.has("gzip")) {
        const compressed = gzipSync(body);
        res.writeHead(500, { "content-type": "text/plain", "content-encoding": "gzip", "content-length": String(compressed.length) });
        res.end(compressed);
        return;
      }
      if (requestUrl.searchParams.has("chunked")) {
        res.writeHead(500, { "content-type": "text/plain" });
        for (let sent = 0; sent < size; sent += 65_536) res.write(body.subarray(sent, sent + 65_536));
        res.end();
        return;
      }
      res.writeHead(500, { "content-type": "text/plain", "content-length": String(size) });
      res.end(body);
      return;
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
