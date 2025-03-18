/**
 * Utility class for CSRF token management
 */
export class CsrfUtils {
  /**
   * Extracts CSRF token from a meta tag in the document head
   * @param metaName The name attribute of the meta tag (default: "csrf-token")
   * @returns The CSRF token or null if not found
   */
  static getTokenFromMeta(metaName = "csrf-token"): string | null {
    if (typeof document === "undefined") {
      return null;
    }

    const meta = document.querySelector(`meta[name="${metaName}"]`);
    return meta?.getAttribute("content") || null;
  }

  /**
   * Extracts CSRF token from a cookie
   * @param cookieName The name of the cookie containing the CSRF token
   * @returns The CSRF token or null if not found
   */
  static getTokenFromCookie(cookieName = "csrf-token"): string | null {
    if (typeof document === "undefined") {
      return null;
    }

    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === cookieName) {
        return decodeURIComponent(value);
      }
    }
    return null;
  }

  /**
   * Validates if the provided string is a potential CSRF token
   * Checks if the token meets minimum security requirements (non-empty, not too short)
   * @param token The token to validate
   * @returns Whether the token is potentially valid
   */
  static isValidToken(token: string | null | undefined): boolean {
    return typeof token === "string" && token.length >= 8;
  }
}
