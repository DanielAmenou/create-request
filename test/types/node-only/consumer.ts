/**
 * Compiled by `npm run test:types:node` against the built declarations with the ES2022 lib and
 * `@types/node` only — no DOM lib — the way a Node-only project sees the package. `skipLibCheck` is
 * off, so every type the .d.ts references must resolve there.
 */
import create, { type FetchFunction, type RequestConfig, type RequestError, createApi, isRequestError } from "../../../dist/index.js";

interface User {
  id: number;
  name: string;
}

const api = createApi()
  .withBaseURL("https://api.example.com")
  .withCredentials("include")
  .withMode("cors")
  .withRedirect("manual")
  .withReferrerPolicy("strict-origin-when-cross-origin")
  .withPriority("high")
  .withCache("no-store")
  .withKeepAlive()
  .withTimeout(1000)
  .withRetries({ attempts: 2, methods: ["GET", "PUT"] });

// @ts-expect-error not a cache mode
api.withCache("nonsense");
// @ts-expect-error not a priority hint
api.withPriority("urgent");
// @ts-expect-error not a credentials mode
api.withCredentials("always");

const passthrough: FetchFunction = (url, init) => fetch(url, init);
const inspect = (config: RequestConfig): void => void `${config.method} ${config.url} ${Object.keys(config.headers).length}`;

export async function main(): Promise<User | null> {
  const user = await api.get<User>("/me").withFetch(passthrough).withRequestInterceptor(inspect).getJson();
  const { data, error } = await create.post<User>("https://api.example.com/users").withBody({ name: "Ada" }).withBody(new Uint8Array(2)).getResult();
  if (error) {
    const typed: RequestError = error;
    return isRequestError(typed) && typed.code === "HTTP" ? null : user;
  }
  return data;
}

export const search = (name: string): Promise<User[]> => api.query<User[]>("/users/search").withBody({ name }).getJson();

export async function firstChunk(path: string): Promise<string> {
  const reader = (await api.get(path).getBody())!.pipeThrough(new TextDecoderStream()).getReader();
  const { value } = await reader.read();
  return value ?? "";
}
