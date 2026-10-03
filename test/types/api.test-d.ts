/**
 * Type-level tests, compiled by `npm run test:types`. Every `@ts-expect-error` must be consumed
 * (a line that stops erroring fails the build), and expectTypeOf assertions fail at compile time.
 * The C ids name the type-level bugs found when v1 was audited.
 */
import { expectTypeOf } from "expect-type";
import * as v from "valibot";
import { z } from "zod";
import create, {
  type HttpRequest,
  RequestError,
  ResponseWrapper,
  createApi,
  createDelete,
  createGet,
  createPost,
  isRequestError,
  type ApiBuilder,
  type BaseRequest,
  type BodyRequest,
  type DeleteRequest,
  type ErrorInterceptor,
  type GetRequest,
  type Method,
  type PostRequest,
  type RequestConfig,
  type RequestErrorCode,
  type RequestInterceptor,
  type ResponseInterceptor,
  type RequestResult,
  type RetryConfig,
  type StandardSchemaV1,
} from "../../src/index.js";

interface User {
  id: number;
  name: string;
}
declare const user: User;
declare const api: ApiBuilder;

// ---------------------------------------------------------------- factories & method typing (C1, C9)
expectTypeOf(create.get("/x")).toEqualTypeOf<HttpRequest<"GET">>();
expectTypeOf(create.post("/x")).toEqualTypeOf<HttpRequest<"POST">>();
expectTypeOf(create.delete("/x")).toEqualTypeOf<HttpRequest<"DELETE">>();
expectTypeOf(create.del).toEqualTypeOf(create.delete);
expectTypeOf(createGet<User>("/x")).toEqualTypeOf<GetRequest<User>>();
expectTypeOf(createPost("/x")).toEqualTypeOf<PostRequest>();
expectTypeOf(createDelete("/x")).toEqualTypeOf<DeleteRequest>();
expectTypeOf<GetRequest>().toExtend<BaseRequest>();
expectTypeOf<PostRequest>().toExtend<BodyRequest>();
expectTypeOf(create.get("/x").method).toEqualTypeOf<"GET">();

// Chains keep their full type after every method (C1)
expectTypeOf(create.post("/x").withCredentials("include").withCache("no-cache").withBody({}).withTimeout(1).withRetries(2)).toEqualTypeOf<HttpRequest<"POST">>();
expectTypeOf(create.post<User>("/x").withBody(user).withHeader("a", "b")).toEqualTypeOf<HttpRequest<"POST", User>>();
expectTypeOf(create.delete("/x").withBody({ reason: "gone" })).toEqualTypeOf<HttpRequest<"DELETE">>();
expectTypeOf(create.put("/x").withGraphQL("query { me }", { id: 1 }, { throwOnError: true })).toEqualTypeOf<HttpRequest<"PUT">>();

// Bodies are a compile error on methods that cannot carry one
// @ts-expect-error GET requests have no body
create.get("/x").withBody({});
// @ts-expect-error HEAD requests have no body
create.head("/x").withGraphQL("q");
// @ts-expect-error OPTIONS requests have no body
create.options("/x").withBody("x");

// Interfaces are valid bodies (C3)
create.post("/x").withBody(user);
create.post("/x").withBody([user]);
create.post("/x").withBody(new FormData());
create.post("/x").withBody(new Blob());
create.post("/x").withBody("text");
// @ts-expect-error primitives other than strings are not bodies
create.post("/x").withBody(42);

// ---------------------------------------------------------------- execution types (C2, C4, C14)
expectTypeOf(create.get("/x").getJson<User>()).toEqualTypeOf<Promise<User>>();
expectTypeOf(create.get<User>("/x").getJson()).toEqualTypeOf<Promise<User>>();
expectTypeOf(api.get<User[]>("/users").getJson()).toEqualTypeOf<Promise<User[]>>();
expectTypeOf(create.get("/x").getJson()).toEqualTypeOf<Promise<unknown>>();
expectTypeOf(create.get<User>("/x").getJson<User | null>()).toEqualTypeOf<Promise<User | null>>();
expectTypeOf(create.get("/x").getText()).toEqualTypeOf<Promise<string>>();
expectTypeOf(create.get("/x").getBlob()).toEqualTypeOf<Promise<Blob>>();
expectTypeOf(create.get("/x").getArrayBuffer()).toEqualTypeOf<Promise<ArrayBuffer>>();
expectTypeOf(create.get("/x").getFormData()).toEqualTypeOf<Promise<FormData>>();
expectTypeOf(create.get("/x").getBody()).toEqualTypeOf<Promise<ReadableStream<Uint8Array> | null>>();
expectTypeOf(create.get<User>("/x").getResponse()).toEqualTypeOf<Promise<ResponseWrapper<User>>>();

// getData: no selector → T, selector → R, with the selector receiving T (not T | null)
expectTypeOf(create.get<User>("/x").getData()).toEqualTypeOf<Promise<User>>();
expectTypeOf(create.get("/x").getData<{ data: User[] }, User[]>(d => d.data)).toEqualTypeOf<Promise<User[]>>();
// @ts-expect-error one explicit type argument cannot infer the selector result — declare T on the request instead
create.get("/x").getData<{ data: User[] }>(d => d.data);
expectTypeOf(create.get<{ data: User[] }>("/x").getData(d => d.data.map(u => u.id))).toEqualTypeOf<Promise<number[]>>();

// getResult: a discriminated union
const result = await create.get<User>("/x").getResult();
expectTypeOf(result).toEqualTypeOf<RequestResult<User>>();
if (result.error) {
  expectTypeOf(result.error).toEqualTypeOf<RequestError>();
  expectTypeOf(result.data).toEqualTypeOf<null>();
} else {
  expectTypeOf(result.data).toEqualTypeOf<User>();
  expectTypeOf(result.error).toEqualTypeOf<null>();
}

// ---------------------------------------------------------------- Standard Schema inference
const ZodUser = z.object({ id: z.number(), name: z.string() });
const ValibotUser = v.object({ id: v.number(), name: v.string() });
expectTypeOf(create.get("/x").getJson(ZodUser)).toEqualTypeOf<Promise<{ id: number; name: string }>>();
expectTypeOf(create.get("/x").getJson(ValibotUser)).toEqualTypeOf<Promise<{ id: number; name: string }>>();
expectTypeOf(create.get("/x").getData(ZodUser)).toEqualTypeOf<Promise<{ id: number; name: string }>>();
expectTypeOf(create.get("/x").getData(ZodUser, u => u.name)).toEqualTypeOf<Promise<string>>();
expectTypeOf(create.get("/x").getResult(ZodUser)).toEqualTypeOf<Promise<RequestResult<{ id: number; name: string }>>>();
expectTypeOf(create.get("/x").getJson(z.string().transform(s => s.length))).toEqualTypeOf<Promise<number>>();
expectTypeOf<StandardSchemaV1.InferOutput<typeof ZodUser>>().toEqualTypeOf<{ id: number; name: string }>();
// @ts-expect-error a plain object is not a schema or a selector
create.get("/x").getData({ not: "a schema" });

// ---------------------------------------------------------------- inputs (C5, C6, C7, C8)
create
  .get("/x")
  .withQueryParam("ids", [1, 2, 3])
  .withQueryParams({ page: 1, ok: true, at: new Date(), none: null, tags: ["a"] })
  .withQueryParams(new URLSearchParams());
create.get("/x").withHeaders({ a: "1", b: undefined, c: null, d: 2 }).withHeader("e", null);
create
  .get("/x")
  .withHeaders(new Headers({ a: "1" }))
  .withHeaders([["b", "2"]]);
// @ts-expect-error a header pair is [name, value]
create.get("/x").withHeaders([["a"]]);
create.get("/x").withCache("no-cache").withCredentials("omit").withMode("no-cors").withRedirect("manual").withReferrerPolicy("no-referrer").withPriority("low");
// @ts-expect-error cache modes are a union, not any string (C7)
create.get("/x").withCache("typo");
// @ts-expect-error credentials are a union
create.get("/x").withCredentials("always");
create.get("/x").withSignal(new AbortController().signal).withAbortController(new AbortController());
create.get("/x").withRetries({
  attempts: 3,
  delay: ({ attempt, error }) => attempt * (error.status ?? 1),
  statuses: [503],
  methods: ["GET"],
  maxDelay: 1,
  shouldRetry: async () => true,
  onRetry: ({ delay }) => void delay,
});
expectTypeOf<RetryConfig["delay"]>().toEqualTypeOf<number | ((context: { attempt: number; error: RequestError }) => number) | undefined>();
create
  .get("/x")
  .withCsrf()
  .withCsrf({ token: () => null, header: "X", crossOrigin: true })
  .withCsrf({ cookie: "c" });
create.get("/x").withFetch(fetch);
create.get("/x").withFetch(async () => new Response());

// ---------------------------------------------------------------- errors (C10)
declare const error: RequestError<{ message: string }>;
expectTypeOf(error.code).toEqualTypeOf<RequestErrorCode>();
expectTypeOf(error.data).toEqualTypeOf<{ message: string } | undefined>();
expectTypeOf(error.status).toEqualTypeOf<number | undefined>();
expectTypeOf(error.method).toEqualTypeOf<Method>();
expectTypeOf(error.cause).toEqualTypeOf<unknown>();
expectTypeOf(error.issues).toEqualTypeOf<readonly StandardSchemaV1.Issue[] | undefined>();
expectTypeOf(error.isTimeout).toEqualTypeOf<boolean>();
declare const thrown: unknown;
if (isRequestError(thrown)) {
  expectTypeOf(thrown).toEqualTypeOf<RequestError>();
  switch (thrown.code) {
    case "HTTP":
    case "NETWORK":
    case "TIMEOUT":
    case "ABORTED":
    case "PARSE":
    case "VALIDATION":
    case "INTERCEPTOR":
    case "GRAPHQL":
      break;
    default:
      expectTypeOf(thrown.code).toEqualTypeOf<never>();
  }
}
new RequestError("x", { code: "HTTP", url: "/", method: "GET", status: 500, response: new Response(), body: "", cause: 1 });
// @ts-expect-error code is required
new RequestError("x", { url: "/", method: "GET" });

// ---------------------------------------------------------------- interceptors (C15)
const requestInterceptor: RequestInterceptor = config => {
  expectTypeOf(config).toEqualTypeOf<RequestConfig>();
  expectTypeOf(config.headers).toEqualTypeOf<Record<string, string>>();
  expectTypeOf(config.method).toEqualTypeOf<Method>();
  config.headers["x"] = "1";
};
const shortCircuit: RequestInterceptor = () => new Response();
const asyncReplace: RequestInterceptor = async config => ({ ...config, url: "/other" });
const responseInterceptor: ResponseInterceptor = response => void response.status;
const errorInterceptor: ErrorInterceptor = async e => (e.status === 404 ? new ResponseWrapper(new Response()) : undefined);
create
  .get("/x")
  .withRequestInterceptor(requestInterceptor)
  .withRequestInterceptor(shortCircuit)
  .withRequestInterceptor(asyncReplace)
  .withResponseInterceptor(responseInterceptor)
  .withErrorInterceptor(errorInterceptor);
// @ts-expect-error a request interceptor cannot return a string
create.get("/x").withRequestInterceptor(() => "nope");

// ---------------------------------------------------------------- api builder (C11, C13)
const configured = createApi()
  .withBaseURL("https://e.com")
  .withBearerToken("t")
  .withTimeout(1)
  .withRetries(1)
  .withCsrf()
  .withRequestInterceptor(requestInterceptor)
  .withFetch(fetch);
expectTypeOf(configured).toEqualTypeOf<ApiBuilder>();
expectTypeOf(create.api).toEqualTypeOf<typeof createApi>();
expectTypeOf(configured.get<User>("/me")).toEqualTypeOf<HttpRequest<"GET", User>>();
expectTypeOf(configured.delete("/x")).toEqualTypeOf<HttpRequest<"DELETE">>();
expectTypeOf(configured.del("/x")).toEqualTypeOf<HttpRequest<"DELETE">>();
expectTypeOf<Parameters<ApiBuilder["withRetries"]>>().toEqualTypeOf<Parameters<HttpRequest["withRetries"]>>();
expectTypeOf<Parameters<ApiBuilder["withHeaders"]>>().toEqualTypeOf<Parameters<HttpRequest["withHeaders"]>>();
expectTypeOf<ReturnType<ApiBuilder["withTimeout"]>>().toEqualTypeOf<ApiBuilder>();
expectTypeOf<ApiBuilder>().not.toHaveProperty("withBody");
expectTypeOf<ApiBuilder>().not.toHaveProperty("withGraphQL");
expectTypeOf<ApiBuilder>().not.toHaveProperty("withSignal");
expectTypeOf<ApiBuilder>().not.toHaveProperty("withAbortController");
expectTypeOf<ApiBuilder>().not.toHaveProperty("clone");
expectTypeOf<ApiBuilder>().toHaveProperty("onRetry");
// @ts-expect-error bodies live on requests, not apis
configured.withBody({});

// DOM names are not shadowed: the library exports no RequestMode/ReferrerPolicy of its own
expectTypeOf<RequestMode>().toEqualTypeOf<"cors" | "navigate" | "no-cors" | "same-origin">();

// ---------------------------------------------------------------- README examples (compiled verbatim)
const users = await create.get("https://api.example.com/users").getJson<User[]>();
users.forEach(u => u.name);
const created = await create.post("https://api.example.com/users").withBearerToken("token").withBody({ name: "Ada" }).withTimeout(5000).withRetries(2).getJson<User>();
created.id.toFixed();
try {
  await api.delete(`/users/${created.id}`).getResponse();
} catch (e) {
  if (isRequestError(e) && e.status === 404) {
    /* already gone */
  } else throw e;
}

// ---------------------------------------------------------------- interface-typed arguments (no index signature)
interface Filters {
  page: number;
  tags: string[];
  since?: Date;
}
interface MyHeaders {
  Accept: string;
  "X-Trace": string | undefined;
}
interface Vars {
  id: string;
}
declare const filters: Filters;
declare const myHeaders: MyHeaders;
declare const vars: Vars;
create.get("/x").withQueryParams(filters).withHeaders(myHeaders).withCookies({ a: "1" });
configured.withQueryParams(filters).withHeaders(myHeaders).withCookies({ a: "1" });
configured.withHeaders(new Headers({ a: "1" })).withHeaders([["b", "2"]]);
create.post("/graphql").withGraphQL("q", vars);
// @ts-expect-error nested objects are not query values
create.get("/x").withQueryParams({ page: { nested: true } });
// @ts-expect-error nested objects are not query values on apis either
configured.withQueryParams({ page: { nested: true } });
// @ts-expect-error header values are strings or numbers
create.get("/x").withHeaders({ a: true });

// ---------------------------------------------------------------- interceptors receive the request
create.get("/x").withResponseInterceptor((response, request) => {
  expectTypeOf(request).toEqualTypeOf<HttpRequest>();
  expectTypeOf(response).toEqualTypeOf<ResponseWrapper>();
});
create.get("/x").withErrorInterceptor((error, request) => {
  expectTypeOf(request.clone()).toEqualTypeOf<HttpRequest>();
  return error;
});

// ---------------------------------------------------------------- clone, BaseRequest and callable schemas
expectTypeOf(create.post<User>("/x").clone()).toEqualTypeOf<HttpRequest<"POST", User>>();
create.post("/x").clone().withBody({ ok: true });
// @ts-expect-error the clone of a GET has no body either
create.get("/x").clone().withBody({});
declare const anyRequest: BaseRequest;
// @ts-expect-error the method of a BaseRequest is unknown, so it cannot take a body (README §TypeScript)
anyRequest.withBody({});
(anyRequest as BodyRequest).withBody({});

// arktype-style schemas are callable: the schema overloads of getData must win over the selector ones
declare const CallableUser: StandardSchemaV1<unknown, User> & ((value: unknown) => unknown);
declare const wrapper: ResponseWrapper;
expectTypeOf(create.get("/x").getData(CallableUser)).toEqualTypeOf<Promise<User>>();
expectTypeOf(create.get("/x").getData(CallableUser, u => u.name)).toEqualTypeOf<Promise<string>>();
expectTypeOf(wrapper.getData(CallableUser, u => u.id)).toEqualTypeOf<Promise<number>>();
expectTypeOf(create.get("/x").getJson(CallableUser)).toEqualTypeOf<Promise<User>>();
expectTypeOf(create.get("/x").getResult(CallableUser)).toEqualTypeOf<Promise<RequestResult<User>>>();

// readonly (`as const`) arrays are query values; retry methods are the Method union
create
  .get("/x")
  .withQueryParams({ tags: ["a", "b"] as const })
  .withQueryParam("ids", [1, 2] as const);
// @ts-expect-error not an HTTP method
create.get("/x").withRetries({ attempts: 1, methods: ["FETCH"] });
