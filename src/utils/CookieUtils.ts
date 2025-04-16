import type { CookiesRecord } from "../types.js";

export class CookieUtils {
  /**
   * Formats cookies for a request
   * @param cookies Object containing cookie name-value pairs or cookie options
   * @returns Formatted cookie string for the Cookie header
   */
  static formatRequestCookies(cookies: CookiesRecord): string {
    const cookiePairs: string[] = [];

    Object.entries(cookies).forEach(([name, valueOrOptions]) => {
      let value: string;

      if (typeof valueOrOptions === "string") {
        value = valueOrOptions;
      } else {
        // Extract value from options object without validation
        value = valueOrOptions.value;
      }

      // Add the cookie to the request
      cookiePairs.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
    });

    return cookiePairs.join("; ");
  }
}
