import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import { HttpMethod } from "../src/enums";
import {
  GetRequest,
  PostRequest,
  PutRequest,
  DeleteRequest,
  PatchRequest,
  HeadRequest,
  OptionsRequest,
} from "../src/requestMethods";

import { FetchMock } from "./utils/fetchMock";

describe("Request Methods", () => {
  beforeEach(() => {
    FetchMock.install();
  });

  afterEach(() => {
    FetchMock.reset();
    FetchMock.restore();
  });

  it("should create GET request with correct method", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new GetRequest();

    // Act
    await request.sendTo("https://api.example.com/resource");

    // Assert
    const [, options] = FetchMock.mock.calls[0] as [string, RequestInit];
    assert.equal(options.method, HttpMethod.GET);
  });

  it("should create POST request with correct method", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new PostRequest();

    // Act
    await request.sendTo("https://api.example.com/resource");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.method, HttpMethod.POST);
  });

  it("should create PUT request with correct method", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new PutRequest();

    // Act
    await request.sendTo("https://api.example.com/resource");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.method, HttpMethod.PUT);
  });

  it("should create DELETE request with correct method", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new DeleteRequest();

    // Act
    await request.sendTo("https://api.example.com/resource");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.method, HttpMethod.DELETE);
  });

  it("should create PATCH request with correct method", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new PatchRequest();

    // Act
    await request.sendTo("https://api.example.com/resource");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.method, HttpMethod.PATCH);
  });

  it("should create HEAD request with correct method", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new HeadRequest();

    // Act
    await request.sendTo("https://api.example.com/resource");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.method, HttpMethod.HEAD);
  });

  it("should create OPTIONS request with correct method", async () => {
    // Arrange
    FetchMock.mockResponseOnce();
    const request = new OptionsRequest();

    // Act
    await request.sendTo("https://api.example.com/resource");

    // Assert
    const [, options] = FetchMock.mock.calls[0];
    assert.equal(options.method, HttpMethod.OPTIONS);
  });
});
