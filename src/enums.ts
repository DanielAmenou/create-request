/**
 * Enum for HTTP methods
 */
export const HttpMethod = {
  GET: "GET",
  PUT: "PUT",
  POST: "POST",
  HEAD: "HEAD",
  PATCH: "PATCH",
  DELETE: "DELETE",
  OPTIONS: "OPTIONS",
} as const;
export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

/**
 * Enum for request priorities
 */
export const RequestPriority = {
  LOW: "low",
  HIGH: "high",
  AUTO: "auto",
} as const;
export type RequestPriority = (typeof RequestPriority)[keyof typeof RequestPriority];

/**
 * Enum for credentials policies
 */
export const CredentialsPolicy = {
  OMIT: "omit",
  INCLUDE: "include",
  SAME_ORIGIN: "same-origin",
} as const;
export type CredentialsPolicy = (typeof CredentialsPolicy)[keyof typeof CredentialsPolicy];

/**
 * Enum for request modes
 */
export const RequestMode = {
  CORS: "cors",
  NO_CORS: "no-cors",
  SAME_ORIGIN: "same-origin",
  NAVIGATE: "navigate",
} as const;
export type RequestMode = (typeof RequestMode)[keyof typeof RequestMode];

/**
 * Enum for redirect modes
 */
export const RedirectMode = {
  ERROR: "error",
  FOLLOW: "follow",
  MANUAL: "manual",
} as const;
export type RedirectMode = (typeof RedirectMode)[keyof typeof RedirectMode];

/**
 * Enum for cookie SameSite policies
 */
export const SameSitePolicy = {
  LAX: "Lax",
  NONE: "None",
  STRICT: "Strict",
} as const;
export type SameSitePolicy = (typeof SameSitePolicy)[keyof typeof SameSitePolicy];

/**
 * Enum for body types
 */
export const BodyType = {
  JSON: "json",
  STRING: "string",
  BINARY: "binary",
} as const;
export type BodyType = (typeof BodyType)[keyof typeof BodyType];

/**
 * Referrer policies for fetch requests
 */
export const ReferrerPolicy = {
  ORIGIN: "origin",
  UNSAFE_URL: "unsafe-url",
  SAME_ORIGIN: "same-origin",
  NO_REFERRER: "no-referrer",
  STRICT_ORIGIN: "strict-origin",
  ORIGIN_WHEN_CROSS_ORIGIN: "origin-when-cross-origin",
  NO_REFERRER_WHEN_DOWNGRADE: "no-referrer-when-downgrade",
  STRICT_ORIGIN_WHEN_CROSS_ORIGIN: "strict-origin-when-cross-origin",
} as const;
export type ReferrerPolicy = (typeof ReferrerPolicy)[keyof typeof ReferrerPolicy];

/**
 * Cache modes for fetch requests
 */
export const CacheMode = {
  RELOAD: "reload",
  DEFAULT: "default",
  NO_CACHE: "no-cache",
  NO_STORE: "no-store",
  FORCE_CACHE: "force-cache",
  ONLY_IF_CACHED: "only-if-cached",
} as const;
export type CacheMode = (typeof CacheMode)[keyof typeof CacheMode];
