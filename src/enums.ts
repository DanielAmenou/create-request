/**
 * Enum for HTTP methods
 */
export enum HttpMethod {
  GET = "GET",
  PUT = "PUT",
  POST = "POST",
  HEAD = "HEAD",
  PATCH = "PATCH",
  DELETE = "DELETE",
  OPTIONS = "OPTIONS",
}

/**
 * Enum for request priorities
 */
export enum RequestPriority {
  LOW = "low",
  HIGH = "high",
  AUTO = "auto",
}

/**
 * Enum for credentials policies
 */
export enum CredentialsPolicy {
  OMIT = "omit",
  INCLUDE = "include",
  SAME_ORIGIN = "same-origin",
}

/**
 * Enum for request modes
 */
export enum RequestMode {
  CORS = "cors",
  NO_CORS = "no-cors",
  SAME_ORIGIN = "same-origin",
  NAVIGATE = "navigate",
}

/**
 * Enum for redirect modes
 */
export enum RedirectMode {
  ERROR = "error",
  FOLLOW = "follow",
  MANUAL = "manual",
}

/**
 * Enum for cache modes
 */
export enum CacheMode {
  DEFAULT = "default",
  RELOAD = "reload",
  NO_STORE = "no-store",
  NO_CACHE = "no-cache",
  FORCE_CACHE = "force-cache",
  ONLY_IF_CACHED = "only-if-cached",
}

/**
 * Enum for cookie SameSite policies
 */
export enum SameSitePolicy {
  LAX = "Lax",
  NONE = "None",
  STRICT = "Strict",
}

/**
 * Enum for body types
 */
export enum BodyType {
  JSON = "json",
  STRING = "string",
  BINARY = "binary",
}
