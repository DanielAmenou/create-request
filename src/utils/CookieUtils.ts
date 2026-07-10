import type { CookiesRecord } from "../types.js";

export class CookieUtils {
  /**
   * Formats cookies for a request
   * @param cookies Object containing cookie name-value pairs or cookie options
   * @returns Formatted cookie string for the Cookie header
   */
  static formatRequestCookies(cookies: CookiesRecord): string {
    return Object.entries(cookies)
      .map(([name, valueOrOptions]) => `${encodeURIComponent(name)}=${encodeURIComponent(typeof valueOrOptions === "string" ? valueOrOptions : valueOrOptions.value)}`)
      .join("; ");
  }
}
