import { HttpMethod, RequestPriority, CredentialsPolicy, RequestMode, RedirectMode, SameSitePolicy, CacheMode, type ReferrerPolicy } from "./enums";
import type { RequestError } from "./RequestError.js";
import type { ResponseWrapper } from "./ResponseWrapper.js";

// Body type extends BodyInit (the standard RequestInit.body type) with support for
// JSON-serializable values (objects and arrays) as a convenience feature.
export type Body = BodyInit | Record<string, unknown> | unknown[];

export type RetryCallback = (options: { attempt: number; error: RequestError }) => void | Promise<void>;

/**
 * Configuration object passed to request interceptors
 * Contains all the information needed to make the request
 */
export interface RequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Body;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
  mode?: RequestMode | string;
  redirect?: RedirectMode | string;
  referrer?: string;
  referrerPolicy?: ReferrerPolicy;
  keepalive?: boolean;
  priority?: RequestPriority | string;
  integrity?: string;
  cache?: CacheMode | RequestCache;
}

/**
 * Request interceptor that can modify the request configuration or return an early response
 * If it returns a Response, the request will be short-circuited and that response will be used
 * @param config - The request configuration
 * @returns Modified config, a Response to short-circuit, or a Promise of either
 */
export type RequestInterceptor = (config: RequestConfig) => RequestConfig | Response | Promise<RequestConfig | Response>;

/**
 * Response interceptor that can transform the response
 * @param response - The response wrapper
 * @returns Modified response wrapper or a Promise of it
 */
export type ResponseInterceptor = (response: ResponseWrapper) => ResponseWrapper | Promise<ResponseWrapper>;

/**
 * Error interceptor that can handle or transform errors
 * Can return a ResponseWrapper to recover from the error
 * @param error - The error that occurred
 * @returns Modified error, a ResponseWrapper to recover, or a Promise of either
 */
export type ErrorInterceptor = (error: RequestError) => RequestError | ResponseWrapper | Promise<RequestError | ResponseWrapper>;

export interface CookieOptions {
  value: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: SameSitePolicy;
  expires?: Date;
  path?: string;
  domain?: string;
  maxAge?: number; // in seconds
}

export type CookiesRecord = Record<string, string | CookieOptions>;

export { HttpMethod, RequestMode, RedirectMode, SameSitePolicy, RequestPriority, CredentialsPolicy, CacheMode };

export interface GraphQLOptions {
  throwOnError?: boolean;
}

export interface RequestOptions extends Omit<RequestInit, "signal" | "body" | "method" | "credentials" | "mode" | "redirect" | "priority" | "cache"> {
  timeout?: number;
  retries?: number;
  onRetry?: RetryCallback;
  body?: Body;
  credentials?: CredentialsPolicy | RequestCredentials;
  mode?: RequestMode;
  redirect?: RedirectMode | RequestRedirect;
  priority?: RequestPriority | string;
  keepalive?: boolean;
  integrity?: string;
  cache?: CacheMode | RequestCache;
}
