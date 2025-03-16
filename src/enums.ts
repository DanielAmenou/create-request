/**
 * Enum for HTTP methods
 */
export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  DELETE = "DELETE",
  PATCH = "PATCH",
  HEAD = "HEAD",
  OPTIONS = "OPTIONS",
}

/**
 * Enum for request priorities
 */
export enum RequestPriority {
  HIGH = "high",
  LOW = "low",
  AUTO = "auto",
}

/**
 * Enum for credentials policies
 */
export enum CredentialsPolicy {
  INCLUDE = "include",
  SAME_ORIGIN = "same-origin",
  OMIT = "omit",
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
  FOLLOW = "follow",
  ERROR = "error",
  MANUAL = "manual",
}

/**
 * Enum for cache modes
 */
export enum CacheMode {
  DEFAULT = "default",
  NO_STORE = "no-store",
  RELOAD = "reload",
  NO_CACHE = "no-cache",
  FORCE_CACHE = "force-cache",
  ONLY_IF_CACHED = "only-if-cached",
}
