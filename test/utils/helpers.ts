import type { FetchFunction, RequestError, StandardSchemaV1 } from "../../src/index.js";

/** For `.then(unexpected, asError)`: turns an expected rejection into the RequestError it carried. */
export const asError = (error: unknown): RequestError => error as RequestError;
/** For `.then(unexpected, asError)`: fails the test when a request that should have failed succeeded. */
export const unexpected = (): never => {
  throw new Error("expected the request to fail");
};

/** Reads a whole stream as UTF-8 text, counting the chunks. */
export async function readAll(stream: ReadableStream<Uint8Array>): Promise<{ text: string; chunks: number }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let chunks = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { text, chunks };
    text += decoder.decode(value, { stream: true });
    chunks++;
  }
}

export interface Call {
  url: string;
  init: RequestInit & { duplex?: string };
  headers: Headers;
}

/** A fetch stub that records every call and answers with `respond` (a Response, an Error to reject with, or a function). */
export function stub(respond: Response | Error | ((call: Call, index: number) => Response | Error | Promise<Response | Error>) = json({})): {
  fetch: FetchFunction;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetch: FetchFunction = async (url, init) => {
    const call: Call = { url, init: init, headers: new Headers(init.headers) };
    calls.push(call);
    const result = typeof respond === "function" ? await respond(call, calls.length - 1) : respond;
    if (result instanceof Error) throw result;
    return result;
  };
  return { fetch, calls };
}

/** A JSON response. */
export const json = (data: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(data), { status: 200, ...init, headers: { "content-type": "application/json", ...(init.headers as Record<string, string>) } });

/** A text response. */
export const text = (body: string, init: ResponseInit = {}): Response =>
  new Response(body, { status: 200, ...init, headers: { "content-type": "text/plain", ...(init.headers as Record<string, string>) } });

/** A response with the given status and a JSON error body. */
export const status = (code: number, body: unknown = { error: `status ${code}` }, headers: Record<string, string> = {}): Response =>
  new Response(code === 204 || code === 304 ? null : JSON.stringify(body), { status: code, headers: { "content-type": "application/json", ...headers } });

/** A fetch error the way undici raises it: TypeError("fetch failed") with a `cause`. */
export const fetchFailed = (cause?: unknown): TypeError => new TypeError("fetch failed", cause === undefined ? undefined : { cause });

/** Resolves once pending promise callbacks and I/O callbacks have run (use with fake timers). */
export async function flush(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise(resolve => setImmediate(resolve));
}

/**
 * A fetch stub whose response body sends one chunk and then stalls. Like a real fetch body, the stream
 * errors with the abort reason when the request's signal aborts.
 */
export const stalled = (init: ResponseInit = {}): FetchFunction =>
  stub(
    call =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"partial":'));
            const signal = call.init.signal;
            if (signal?.aborted) controller.error(signal.reason);
            else signal?.addEventListener("abort", () => controller.error(signal.reason), { once: true });
          },
        }),
        { status: 200, headers: { "content-type": "application/json" }, ...init }
      )
  ).fetch;

/** A fetch that never resolves until `signal` aborts (rejects with the abort reason, like real fetch). */
export const hanging: FetchFunction = (_url, init) =>
  new Promise((_resolve, reject) => {
    const signal = init.signal;
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

/** Runs `fn` with `globalThis.location` (and optionally `document`) defined, restoring them afterwards. */
export async function inBrowser<T>(location: { href: string; origin: string }, fn: () => Promise<T>, cookie = ""): Promise<T> {
  const g = globalThis as { location?: unknown; document?: unknown };
  const previous = { location: g.location, document: g.document };
  g.location = location;
  g.document = { cookie };
  try {
    return await fn();
  } finally {
    if (previous.location === undefined) delete g.location;
    else g.location = previous.location;
    if (previous.document === undefined) delete g.document;
    else g.document = previous.document;
  }
}

/** A minimal Standard Schema for tests: `check` returns an issue message (failure) or nothing (success). */
export const schema = <T>(
  check: (value: unknown) => string | undefined,
  transform?: (value: unknown) => T,
  options: { async?: boolean; path?: readonly (PropertyKey | { key: PropertyKey })[] } = {}
): StandardSchemaV1<unknown, T> => ({
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value: unknown): StandardSchemaV1.Result<T> | Promise<StandardSchemaV1.Result<T>> => {
      const message = check(value);
      const result: StandardSchemaV1.Result<T> = message
        ? { issues: [{ message, ...(options.path ? { path: options.path } : {}) }] }
        : { value: transform ? transform(value) : (value as T) };
      return options.async ? Promise.resolve(result) : result;
    },
  },
});
