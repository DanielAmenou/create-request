import {
  HttpMethod,
  RequestPriority,
  CredentialsPolicy,
  RequestMode,
  RedirectMode,
  CacheMode,
} from "./enums";
import type { RequestError } from "./RequestError";

export type Body =
  | null
  | Blob
  | string
  | object
  | FormData
  | ArrayBuffer
  | URLSearchParams
  | ReadableStream;

export type RetryCallback = (options: {
  attempt: number;
  error: RequestError;
}) => void | Promise<void>;

export { HttpMethod, RequestPriority, CredentialsPolicy, RequestMode, RedirectMode, CacheMode };
export interface RequestOptions
  extends Omit<
    RequestInit,
    "signal" | "body" | "method" | "credentials" | "mode" | "redirect" | "cache" | "priority"
  > {
  timeout?: number;
  retries?: number;
  onRetry?: RetryCallback;
  body?: any;
  credentials?: CredentialsPolicy | RequestCredentials;
  mode?: RequestMode;
  redirect?: RedirectMode | RequestRedirect;
  priority?: RequestPriority | string;
  keepalive?: boolean;
}
