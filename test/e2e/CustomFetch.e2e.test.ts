import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach } from "node:test";
import { Agent, fetch as undiciFetch } from "undici";
import create, { createApi, type FetchFunction } from "../../src/index.js";
import { TestServer } from "./utils/testServer.js";

type UndiciRequestInit = NonNullable<Parameters<typeof undiciFetch>[1]>;

/** An undici Agent that counts how many requests were dispatched through it */
class CountingAgent extends Agent {
  public dispatches = 0;

  dispatch(options: Parameters<Agent["dispatch"]>[0], handler: Parameters<Agent["dispatch"]>[1]): boolean {
    this.dispatches += 1;
    return super.dispatch(options, handler);
  }
}

describe("e2e: custom fetch implementations over real HTTP", { timeout: 30000 }, () => {
  let server: TestServer;

  before(async () => {
    server = await TestServer.start();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(() => {
    server.reset();
    create.config.reset();
  });

  it("routes real requests through a custom undici Agent", async () => {
    const agent = new CountingAgent({ keepAliveTimeout: 1000 });
    const agentFetch: FetchFunction = (url, init) => {
      const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      return undiciFetch(href, { ...(init as unknown as UndiciRequestInit), dispatcher: agent }) as unknown as Promise<Response>;
    };

    try {
      const data = await create.get(server.url("/json")).withFetch(agentFetch).getJson();

      assert.deepEqual(data, { message: "hello", source: "e2e" });
      assert.equal(agent.dispatches, 1, "the request must go through the injected agent");
      assert.equal(server.requests.length, 1);
    } finally {
      await agent.close();
    }
  });

  it("passes framework-specific init options through (Next.js-style caching hints)", async () => {
    const forwardedInits: Array<Record<string, unknown>> = [];
    const nextStyleFetch: FetchFunction = (url, init) => {
      const enriched = { ...init, next: { revalidate: 60 } };
      forwardedInits.push(enriched as unknown as Record<string, unknown>);
      // The global fetch ignores unknown init members, as Next.js' patched fetch would consume them
      return fetch(url, enriched as RequestInit);
    };

    const data = await create.get(server.url("/json")).withHeader("X-Page", "home").withFetch(nextStyleFetch).getJson();

    assert.deepEqual(data, { message: "hello", source: "e2e" });
    assert.equal(forwardedInits.length, 1);
    assert.deepEqual(forwardedInits[0].next, { revalidate: 60 });
    assert.equal((forwardedInits[0].headers as Record<string, string>)["X-Page"], "home");
    assert.equal(server.lastRequest.headers["x-page"], "home");
  });

  it("invokes the custom fetch once per attempt when retrying against a real server", async () => {
    let wrapperCalls = 0;
    const countingFetch: FetchFunction = (url, init) => {
      wrapperCalls += 1;
      return fetch(url, init);
    };

    const data = await create.get(server.url("/flaky/custom-fetch?fails=1")).withFetch(countingFetch).withRetries(2).getJson<{ ok: boolean; hits: number }>();

    assert.deepEqual(data, { ok: true, hits: 2 });
    assert.equal(wrapperCalls, 2);
    assert.equal(server.requests.length, 2);
  });

  it("applies a builder-level custom fetch to every request", async () => {
    let wrapperCalls = 0;
    const countingFetch: FetchFunction = (url, init) => {
      wrapperCalls += 1;
      return fetch(url, init);
    };
    const api = createApi().withBaseURL(server.origin).withFetch(countingFetch);

    await api.get("/json").getJson();
    await api.post("/echo").withBody({ n: 1 }).getJson();

    assert.equal(wrapperCalls, 2);
    assert.equal(server.requests.length, 2);
  });
});
