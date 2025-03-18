/**
 * Global configuration for create-request
 */
export class Config {
  private static instance: Config;

  // CSRF configuration
  private csrfHeaderName: string = "X-CSRF-Token";
  private xsrfCookieName: string = "XSRF-TOKEN";
  private xsrfHeaderName: string = "X-XSRF-TOKEN";
  private csrfToken: string | null = null;
  private enableAutoXsrf: boolean = true;
  private enableAntiCsrf: boolean = true; // X-Requested-With header

  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  /**
   * Set a global CSRF token to be used for all requests
   */
  public setCsrfToken(token: string): Config {
    this.csrfToken = token;
    return this;
  }

  /**
   * Get the global CSRF token
   */
  public getCsrfToken(): string | null {
    return this.csrfToken;
  }

  /**
   * Set the CSRF header name (default is X-CSRF-Token)
   */
  public setCsrfHeaderName(name: string): Config {
    this.csrfHeaderName = name;
    return this;
  }

  /**
   * Get the CSRF header name
   */
  public getCsrfHeaderName(): string {
    return this.csrfHeaderName;
  }

  /**
   * Set the XSRF cookie name to look for (default is XSRF-TOKEN)
   */
  public setXsrfCookieName(name: string): Config {
    this.xsrfCookieName = name;
    return this;
  }

  /**
   * Get the XSRF cookie name
   */
  public getXsrfCookieName(): string {
    return this.xsrfCookieName;
  }

  /**
   * Set the XSRF header name to send the token in (default is X-XSRF-TOKEN)
   */
  public setXsrfHeaderName(name: string): Config {
    this.xsrfHeaderName = name;
    return this;
  }

  /**
   * Get the XSRF header name
   */
  public getXsrfHeaderName(): string {
    return this.xsrfHeaderName;
  }

  /**
   * Enable or disable automatic XSRF token extraction from cookies
   */
  public setEnableAutoXsrf(enable: boolean): Config {
    this.enableAutoXsrf = enable;
    return this;
  }

  /**
   * Check if automatic XSRF is enabled
   */
  public isAutoXsrfEnabled(): boolean {
    return this.enableAutoXsrf;
  }

  /**
   * Enable or disable automatic addition of anti-CSRF headers
   */
  public setEnableAntiCsrf(enable: boolean): Config {
    this.enableAntiCsrf = enable;
    return this;
  }

  /**
   * Check if anti-CSRF is enabled
   */
  public isAntiCsrfEnabled(): boolean {
    return this.enableAntiCsrf;
  }

  /**
   * Reset all configuration options to their defaults
   */
  public reset(): Config {
    this.csrfToken = null;
    this.csrfHeaderName = "X-CSRF-Token";
    this.enableAntiCsrf = true;
    this.xsrfCookieName = "XSRF-TOKEN";
    this.xsrfHeaderName = "X-XSRF-TOKEN";
    this.enableAutoXsrf = true;
    return this;
  }
}
