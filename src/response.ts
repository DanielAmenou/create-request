import { RequestError, type RequestErrorOptions, messageOf } from "./error.js";
import { type StandardSchemaV1, isSchema } from "./schema.js";
import type { Method, RequestErrorCode } from "./types.js";
import { type Deadline, abortError } from "./utils.js";

/**
 * A successful response. Exposes the status line and headers, and reads the body in the format you
 * ask for. The body is buffered once, so you can call several readers, in any order and concurrently
 * (`getJson()` after `getText()`, `Promise.all([res.getJson(), res.getBlob()])`, …) — except
 * `getBody()`, which hands you the live stream and therefore excludes the others.
 *
 * `T` is the JSON type declared at the request (`api.get<User>()`) and is the default for `getJson()` / `getData()`.
 *
 * @example
 * ```typescript
 * const res = await api.get<User>("/me").getResponse();
 * console.log(res.status, res.headers.get("etag"));
 * const user = await res.getJson();   // User
 * ```
 */
export class ResponseWrapper<T = unknown> {
  declare private _bin?: Promise<ArrayBuffer>;
  declare private _text?: Promise<string>;
  declare private _json?: Promise<unknown>;
  /** @internal */
  declare _gqlThrow?: boolean | undefined;
  /** @internal */
  declare _timeout?: Deadline | undefined;
  /** @internal */
  declare _signal?: AbortSignal | undefined;

  /** The underlying `Response`. Read its body through this wrapper's methods, or take it over with `getBody()`. */
  declare readonly raw: Response;
  /** The URL that was requested, including the query string (after interceptors). */
  declare readonly url: string;
  /** The HTTP method that was used. */
  declare readonly method: Method;

  /** Wraps a `Response` — useful to hand a synthetic response to an error interceptor. */
  constructor(raw: Response, url = "", method: Method = "GET") {
    // Declared fields assigned here (not parameter properties), so no class-field definitions are emitted.
    this.raw = raw;
    this.url = url;
    this.method = method;
  }

  /** HTTP status code (`200`, `404`, …). */
  get status(): number {
    return this.raw.status;
  }

  /** HTTP status text (`"OK"`, `"Not Found"`, …); empty over HTTP/2. */
  get statusText(): string {
    return this.raw.statusText;
  }

  /** Whether the status is in the 200–299 range. */
  get ok(): boolean {
    return this.raw.ok;
  }

  /** Response headers. */
  get headers(): Headers {
    return this.raw.headers;
  }

  private _err(message: string, code: RequestErrorCode, extra?: Partial<RequestErrorOptions>): RequestError {
    return new RequestError(message, { code, url: this.url, method: this.method, status: this.raw.status, response: this.raw, ...extra });
  }

  /** The error for a body that cannot be read: TIMEOUT / ABORTED when the deadline or a signal fired, otherwise PARSE with `fallback`. */
  private _unreadable(fallback: string, extra?: Partial<RequestErrorOptions>): RequestError {
    clearTimeout(this._timeout?.timer);
    const aborted = abortError(this._signal, this._timeout);
    return this._err(aborted?.[1] ?? fallback, aborted?.[0] ?? "PARSE", extra);
  }

  private _buffer(): Promise<ArrayBuffer> {
    if (!this._bin) {
      if (this.raw.bodyUsed) return Promise.reject(this._unreadable("Response body already consumed"));
      this._bin = this.raw.arrayBuffer().then(
        buffer => {
          clearTimeout(this._timeout?.timer);
          return buffer;
        },
        (e: unknown) => {
          throw this._unreadable(`Failed to read response body: ${messageOf(e)}`, { cause: e });
        }
      );
    }
    return this._bin;
  }

  private async _validate<S extends StandardSchemaV1>(schema: S, data: unknown): Promise<StandardSchemaV1.InferOutput<S>> {
    let result: StandardSchemaV1.Result<StandardSchemaV1.InferOutput<S>>;
    try {
      result = await schema["~standard"].validate(data);
    } catch (e) {
      throw this._err(`Schema validation threw: ${messageOf(e)}`, "VALIDATION", { cause: e });
    }
    if (result.issues) {
      const [issue] = result.issues;
      const path = issue?.path?.map(p => String(typeof p === "object" ? p.key : p)).join(".");
      throw this._err(`Response validation failed: ${issue?.message}${path ? ` at ${path}` : ""}`, "VALIDATION", { body: await this.getText(), issues: result.issues });
    }
    return result.value;
  }

  /** The body as an `ArrayBuffer`. */
  getArrayBuffer(): Promise<ArrayBuffer> {
    return this._buffer();
  }

  /** The body as a `Blob`, typed with the response's `Content-Type`. */
  async getBlob(): Promise<Blob> {
    return new Blob([await this._buffer()], { type: this.raw.headers.get("content-type") ?? "" });
  }

  /** The body decoded as UTF-8 text (`""` for an empty body). */
  getText(): Promise<string> {
    return (this._text ??= this._buffer().then(buffer => new TextDecoder().decode(buffer)));
  }

  /** The body parsed as `multipart/form-data` or `application/x-www-form-urlencoded`. */
  async getFormData(): Promise<FormData> {
    const buffer = await this._buffer();
    try {
      return await new Response(buffer, { headers: this.raw.headers }).formData();
    } catch (e) {
      throw this._err(`Failed to parse form data: ${messageOf(e)}`, "PARSE", { cause: e });
    }
  }

  /**
   * The raw body stream, for streaming consumption (downloads with progress, SSE/NDJSON, LLM output…).
   * Unlike the other readers it is not buffered: the body can be read once, and only if no other reader ran.
   * Taking the stream also ends the request's `withTimeout()` deadline — from here on the stream is yours.
   * It has the type `fetch` gives `response.body` in your environment (DOM lib or `@types/node`), so it pipes
   * through `TextDecoderStream` and other web streams like that one does.
   *
   * @example
   * ```typescript
   * const reader = (await request.getBody())!.pipeThrough(new TextDecoderStream()).getReader();
   * for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) process(chunk.value);
   * ```
   */
  getBody(): Response["body"] {
    if (this.raw.bodyUsed) throw this._unreadable("Response body already consumed");
    clearTimeout(this._timeout?.timer);
    return this.raw.body;
  }

  /**
   * The body parsed as JSON. An empty body (`204`, `Content-Length: 0`, whitespace) yields `null` —
   * declare it in the type (`getJson<User | null>()`) for endpoints that may return nothing.
   *
   * Pass a [Standard Schema](https://standardschema.dev) (zod, valibot, arktype, …) to validate the body
   * and infer its type; a mismatch rejects with a `RequestError` whose `code` is `"VALIDATION"` and
   * whose `issues` lists what went wrong.
   *
   * @example
   * ```typescript
   * const user = await res.getJson<User>();
   * const user = await res.getJson(UserSchema);   // typed from the schema, validated at runtime
   * ```
   */
  getJson<U = T>(): Promise<U>;
  getJson<S extends StandardSchemaV1>(schema: S): Promise<StandardSchemaV1.InferOutput<S>>;
  getJson(schema?: StandardSchemaV1): Promise<unknown> {
    this._json ??= this.getText().then(text => {
      if (!text.trim()) return null;
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw this._err(`Invalid JSON response: ${messageOf(e)}`, "PARSE", { body: text, cause: e });
      }
      const errors = this._gqlThrow ? (data as { errors?: unknown } | null)?.errors : undefined;
      if (Array.isArray(errors) && errors.length) {
        const messages = errors.map(e => {
          const message: unknown = (e as { message?: unknown } | null)?.message ?? e;
          return typeof message === "string" ? message : JSON.stringify(message);
        });
        throw this._err(`GraphQL error: ${messages.join("; ")}`, "GRAPHQL", { body: text });
      }
      return data;
    });
    return schema ? this._json.then(data => this._validate(schema, data)) : this._json;
  }

  /**
   * `getJson()` followed by a selector, so you can pick the part you need in one call. The selector
   * receives `T` (declare it on the request: `api.get<Page>()`), or pass both type arguments explicitly.
   * A selector that throws (or returns a promise that rejects) is reported as a `RequestError` with code `"PARSE"`.
   * A schema can be validated first.
   *
   * @example
   * ```typescript
   * const names = await res.getData(page => page.users.map(u => u.name));      // res: ResponseWrapper<Page>
   * const names = await res.getData<Page, string[]>(page => page.users.map(u => u.name));
   * const names = await res.getData(PageSchema, page => page.users.map(u => u.name));
   * ```
   */
  getData<U = T>(): Promise<U>;
  // Schema overloads first: a callable schema (arktype) must not be mistaken for a selector.
  getData<S extends StandardSchemaV1>(schema: S): Promise<StandardSchemaV1.InferOutput<S>>;
  getData<S extends StandardSchemaV1, R>(schema: S, selector: (data: StandardSchemaV1.InferOutput<S>) => R): Promise<R>;
  getData<R>(selector: (data: T) => R): Promise<R>;
  getData<U, R>(selector: (data: U) => R): Promise<R>;
  async getData(schemaOrSelector?: StandardSchemaV1 | ((data: never) => unknown), selector?: (data: never) => unknown): Promise<unknown> {
    const schema = isSchema(schemaOrSelector) ? schemaOrSelector : undefined;
    const select = (schema ? selector : schemaOrSelector) as ((data: unknown) => unknown) | undefined;
    const data = await this.getJson(schema!);
    if (!select) return data;
    try {
      return await select(data);
    } catch (e) {
      throw this._err(`Selector failed: ${messageOf(e)}`, "PARSE", { cause: e });
    }
  }
}
