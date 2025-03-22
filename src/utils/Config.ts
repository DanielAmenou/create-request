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
   * Get the singleton instance of the Config class
   *
   * @returns The global configuration instance
   *
   * @example
   * const config = Config.getInstance();
   * config.setCsrfToken('token123');
   */
  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  /**
   * Set a global CSRF token to be used for all requests
   *
   * @param token - The CSRF token value
   * @returns The config instance for chaining
   *
   * @example
   * Config.getInstance().setCsrfToken('myToken123');
   */
  public setCsrfToken(token: string): Config {
    this.csrfToken = token;
    return this;
  }

  /**
   * Get the global CSRF token that will be automatically applied to requests
   *
   * @returns The current CSRF token or null if not set
   */
  public getCsrfToken(): string | null {
    return this.csrfToken;
  }

  /**
   * Set the CSRF header name used when sending the token
   *
   * @param name - The header name to use
   * @returns The config instance for chaining
   *
   * @example
   * Config.getInstance().setCsrfHeaderName('X-My-CSRF-Token');
   */
  public setCsrfHeaderName(name: string): Config {
    this.csrfHeaderName = name;
    return this;
  }

  /**
   * Get the configured CSRF header name
   *
   * @returns The current CSRF header name
   */
  public getCsrfHeaderName(): string {
    return this.csrfHeaderName;
  }

  /**
   * Set the XSRF cookie name to look for when extracting tokens from cookies
   *
   * @param name - The cookie name to look for
   * @returns The config instance for chaining
   *
   * @example
   * Config.getInstance().setXsrfCookieName('MY-XSRF-COOKIE');
   */
  public setXsrfCookieName(name: string): Config {
    this.xsrfCookieName = name;
    return this;
  }

  /**
   * Get the configured XSRF cookie name
   *
   * @returns The current XSRF cookie name
   */
  public getXsrfCookieName(): string {
    return this.xsrfCookieName;
  }

  /**
   * Set the XSRF header name for sending tokens extracted from cookies
   *
   * @param name - The header name to use
   * @returns The config instance for chaining
   */
  public setXsrfHeaderName(name: string): Config {
    this.xsrfHeaderName = name;
    return this;
  }

  /**
   * Get the configured XSRF header name
   *
   * @returns The current XSRF header name
   */
  public getXsrfHeaderName(): string {
    return this.xsrfHeaderName;
  }

  /**
   * Enable or disable automatic extraction of XSRF tokens from cookies
   * When enabled, the library will look for XSRF tokens in cookies and
   * automatically add them to request headers.
   *
   * @param enable - Whether to enable this feature
   * @returns The config instance for chaining
   *
   * @example
   * Config.getInstance().setEnableAutoXsrf(false); // Disable XSRF extraction
   */
  public setEnableAutoXsrf(enable: boolean): Config {
    this.enableAutoXsrf = enable;
    return this;
  }

  /**
   * Check if automatic XSRF token extraction is enabled
   *
   * @returns True if automatic XSRF is enabled
   */
  public isAutoXsrfEnabled(): boolean {
    return this.enableAutoXsrf;
  }

  /**
   * Enable or disable automatic addition of anti-CSRF headers
   * When enabled, X-Requested-With: XMLHttpRequest will be added to all requests.
   *
   * @param enable - Whether to enable this feature
   * @returns The config instance for chaining
   */
  public setEnableAntiCsrf(enable: boolean): Config {
    this.enableAntiCsrf = enable;
    return this;
  }

  /**
   * Check if anti-CSRF protection is enabled
   *
   * @returns True if anti-CSRF protection is enabled
   */
  public isAntiCsrfEnabled(): boolean {
    return this.enableAntiCsrf;
  }

  /**
   * Reset all configuration options to their default values
   *
   * @returns The config instance for chaining
   *
   * @example
   * Config.getInstance().reset();
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
