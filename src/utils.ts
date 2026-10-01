/** Combines signals into one (dropping `undefined`); `AbortSignal.any` where available, a small polyfill otherwise. */
export const anySignal = (signals: (AbortSignal | undefined)[]): AbortSignal | undefined => {
  const list = signals.filter((signal): signal is AbortSignal => !!signal);
  if (list.length < 2) return list[0];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- missing in Safari < 17.4, Chrome < 116
  if (AbortSignal.any) return AbortSignal.any(list);
  const controller = new AbortController();
  for (const signal of list) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
};

import type { RequestErrorCode } from "./types.js";

/** A running `withTimeout()` deadline: the controller that aborts, its timer, and the configured duration. */
export interface Deadline {
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
  ms: number;
}

/**
 * Classifies a failure of `fetch` or of a body read that happened while `signal` (the combined signal
 * handed to fetch) was aborted: our own deadline → `TIMEOUT`, a signal aborted with a `TimeoutError`
 * reason (`AbortSignal.timeout()`) → `TIMEOUT`, any other abort → `ABORTED`; `undefined` otherwise.
 */
export const abortError = (signal: AbortSignal | undefined, deadline: Deadline | undefined): [RequestErrorCode, string] | undefined => {
  if (deadline?.controller.signal.aborted) return ["TIMEOUT", `Request timed out after ${deadline.ms}ms`];
  if (!signal?.aborted) return undefined;
  return (signal.reason as { name?: string } | null)?.name === "TimeoutError" ? ["TIMEOUT", "Request timed out"] : ["ABORTED", "Request aborted"];
};

/** The longest delay `setTimeout` accepts (2^31 − 1 ms ≈ 24.8 days); anything above fires immediately. */
export const MAX_DELAY = 2 ** 31 - 1;

/** Resolves after `ms`, or at once if `signal` is (or becomes) aborted — the next attempt then fails with the abort. */
export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise(resolve => {
    if (signal?.aborted) return resolve();
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, Math.min(ms, MAX_DELAY));
    signal?.addEventListener("abort", done);
  });

/** Swallows the rejection of a cleanup promise (`body.cancel()` on a stream that is locked or already closed). */
export const release = (body: ReadableStream | null | undefined): undefined => void body?.cancel().catch(() => undefined);

/**
 * Reads a body as UTF-8 text, giving up (and cancelling the stream) once more than `max` bytes arrived
 * or the read failed — for error bodies, which are captured without the caller asking for them.
 */
export const readCapped = async (body: ReadableStream<Uint8Array> | null, max: number): Promise<string | undefined> => {
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    for (const reader = body?.getReader(); reader;) {
      const { done, value } = await reader.read();
      if (done) break;
      if ((size += value.length) > max) return void reader.cancel().catch(() => undefined); // the reader holds the lock
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch {
    return undefined;
  }
};

/** Whether `url` is well-formed: non-empty, and parseable when absolute. Relative URLs are always accepted. */
export const validUrl = (url: string): boolean => {
  try {
    return !!url.trim() && !!new URL(url, "http://_");
  } catch {
    return false;
  }
};

/**
 * Whether `url` targets the page's origin. Relative URLs are resolved the way `fetch` resolves them —
 * against the document's base URL (`<base href>`), falling back to `location.href`. Outside a browser
 * there is no page origin and every URL counts as same-origin.
 */
export const sameOrigin = (url: string): boolean => {
  if (typeof location === "undefined") return true;
  try {
    return new URL(url, (typeof document !== "undefined" && document.baseURI) || location.href).origin === location.origin;
  } catch {
    return false;
  }
};

/** Reads a cookie from `document.cookie` (decoded when possible). */
export const readCookie = (name: string): string | undefined => {
  if (typeof document === "undefined") return undefined;
  for (const part of document.cookie.split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) {
      const value = part.slice(at + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return undefined;
};

/** The delay requested by a `Retry-After` header (seconds or HTTP date) in milliseconds, or `undefined`. */
export const retryAfter = (response?: Response): number | undefined => {
  const header = response?.headers.get("retry-after");
  if (!header) return undefined;
  const ms = /^\d+(\.\d+)?$/.test(header) ? +header * 1000 : Date.parse(header) - Date.now();
  return ms >= 0 ? ms : ms < 0 ? 0 : undefined;
};
