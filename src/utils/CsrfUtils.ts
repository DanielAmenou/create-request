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
   * Checks if the token meets security requirements
   * @param token The token to validate
   * @returns Whether the token is valid
   */
  static isValidToken(token: string | null | undefined): boolean {
    // Basic checks for null/undefined and type
    if (typeof token !== "string") {
      return false;
    }

    // Check minimum length
    if (token.length < 16) {
      return false;
    }

    // Check for valid character set (alphanumeric & common token symbols)
    // This helps prevent XSS and injection attacks through malformed tokens
    const validTokenRegex = /^[A-Za-z0-9\-_=+/.]+$/;
    if (!validTokenRegex.test(token)) {
      return false;
    }

    // Check for sufficient entropy (at least 3 different character types)
    const hasUpperCase = /[A-Z]/.test(token);
    const hasLowerCase = /[a-z]/.test(token);
    const hasNumbers = /[0-9]/.test(token);
    const hasSpecials = /[\-_=+/.]/.test(token);

    const characterTypesCount = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecials].filter(
      Boolean
    ).length;

    return characterTypesCount >= 2;
  }
}
