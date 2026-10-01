import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as v from "valibot";
import { z } from "zod";
import create from "../../src/index.js";
import { asError, json, stub, unexpected } from "../utils/helpers.js";

const User = z.object({ id: z.number(), name: z.string(), email: z.email().optional() });
const UserV = v.object({ id: v.number(), name: v.string() });

describe("Standard Schema integration", () => {
  it("validates and types responses with zod", async () => {
    const user = await create
      .get("/me")
      .withFetch(stub(json({ id: 1, name: "Ada", extra: true })).fetch)
      .getJson(User);
    assert.deepEqual(user, { id: 1, name: "Ada" });
    const name: string = user.name;
    assert.equal(name, "Ada");
  });

  it("validates with valibot too, with getData selectors and getResult", async () => {
    const make = () => create.get("/me").withFetch(stub(json({ id: 2, name: "Bob" })).fetch);
    assert.equal(await make().getData(UserV, u => u.name), "Bob");
    assert.deepEqual(await make().getResult(UserV), { data: { id: 2, name: "Bob" }, error: null });
  });

  it("reports the first issue in the message and all issues on the error", async () => {
    const error = await create
      .get("/me")
      .withFetch(stub(json({ id: "1", name: 2 })).fetch)
      .getJson(User)
      .then(unexpected, asError);
    assert.equal(error.code, "VALIDATION");
    assert.ok(error.message.startsWith("Response validation failed: "), error.message);
    assert.ok(error.message.endsWith(" at id"), error.message);
    assert.equal(error.issues?.length, 2);
    assert.deepEqual(error.data, { id: "1", name: 2 });

    const result = await create
      .get("/me")
      .withFetch(stub(json(null)).fetch)
      .getResult(UserV);
    assert.equal(result.data, null);
    assert.equal(result.error?.code, "VALIDATION");
  });

  it("applies transforms and async refinements", async () => {
    const Upper = z.string().transform(s => s.toUpperCase());
    assert.equal(
      await create
        .get("/x")
        .withFetch(stub(json("abc")).fetch)
        .getJson(Upper),
      "ABC"
    );
    const Checked = z.number().refine(async n => n > 0, "must be positive");
    assert.equal(
      await create
        .get("/x")
        .withFetch(stub(json(1)).fetch)
        .getJson(Checked),
      1
    );
    await assert.rejects(
      create
        .get("/x")
        .withFetch(stub(json(-1)).fetch)
        .getJson(Checked),
      { code: "VALIDATION", message: "Response validation failed: must be positive" }
    );
  });
});
