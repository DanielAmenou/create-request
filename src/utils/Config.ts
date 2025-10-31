import type { RequestInterceptor, ResponseInterceptor, ErrorInterceptor } from "../types.js";

/**
 * Internal storage for interceptors with IDs
 */
interface InterceptorWithId<T> {
  id: number;
  interceptor: T;
}

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

  // Interceptor configuration
  private requestInterceptors: InterceptorWithId<RequestInterceptor>[] = [];
  private responseInterceptors: InterceptorWithId<ResponseInterceptor>[] = [];
  private errorInterceptors: InterceptorWithId<ErrorInterceptor>[] = [];
  private nextInterceptorId: number = 1;

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
   * Add a global request interceptor
   * Request interceptors can modify the request configuration or return an early response
   *
   * @param interceptor - The request interceptor function
   * @returns The interceptor ID for later removal
   *
   * @example
   * const id = Config.getInstance().addRequestInterceptor((config) => {
   *   config.headers['X-Custom'] = 'value';
   *   return config;
   * });
   */
  public addRequestInterceptor(interceptor: RequestInterceptor): number {
    const id = this.nextInterceptorId++;
    this.requestInterceptors.push({ id, interceptor });
    return id;
  }

  /**
   * Add a global response interceptor
   * Response interceptors can transform the response
   *
   * @param interceptor - The response interceptor function
   * @returns The interceptor ID for later removal
   *
   * @example
   * const id = Config.getInstance().addResponseInterceptor((response) => {
   *   console.log('Response received:', response.status);
   *   return response;
   * });
   */
  public addResponseInterceptor(interceptor: ResponseInterceptor): number {
    const id = this.nextInterceptorId++;
    this.responseInterceptors.push({ id, interceptor });
    return id;
  }

  /**
   * Add a global error interceptor
   * Error interceptors can handle or transform errors
   *
   * @param interceptor - The error interceptor function
   * @returns The interceptor ID for later removal
   *
   * @example
   * const id = Config.getInstance().addErrorInterceptor((error) => {
   *   console.error('Request failed:', error);
   *   throw error;
   * });
   */
  public addErrorInterceptor(interceptor: ErrorInterceptor): number {
    const id = this.nextInterceptorId++;
    this.errorInterceptors.push({ id, interceptor });
    return id;
  }

  /**
   * Remove a request interceptor by its ID
   *
   * @param id - The interceptor ID returned from addRequestInterceptor
   *
   * @example
   * Config.getInstance().removeRequestInterceptor(id);
   */
  public removeRequestInterceptor(id: number): void {
    this.requestInterceptors = this.requestInterceptors.filter(item => item.id !== id);
  }

  /**
   * Remove a response interceptor by its ID
   *
   * @param id - The interceptor ID returned from addResponseInterceptor
   *
   * @example
   * Config.getInstance().removeResponseInterceptor(id);
   */
  public removeResponseInterceptor(id: number): void {
    this.responseInterceptors = this.responseInterceptors.filter(item => item.id !== id);
  }

  /**
   * Remove an error interceptor by its ID
   *
   * @param id - The interceptor ID returned from addErrorInterceptor
   *
   * @example
   * Config.getInstance().removeErrorInterceptor(id);
   */
  public removeErrorInterceptor(id: number): void {
    this.errorInterceptors = this.errorInterceptors.filter(item => item.id !== id);
  }

  /**
   * Clear all interceptors (request, response, and error)
   *
   * @example
   * Config.getInstance().clearInterceptors();
   */
  public clearInterceptors(): void {
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    this.errorInterceptors = [];
  }

  /**
   * Get all global request interceptors (in registration order)
   * @internal
   */
  public getRequestInterceptors(): RequestInterceptor[] {
    return this.requestInterceptors.map(item => item.interceptor);
  }

  /**
   * Get all global response interceptors (in registration order)
   * @internal
   */
  public getResponseInterceptors(): ResponseInterceptor[] {
    return this.responseInterceptors.map(item => item.interceptor);
  }

  /**
   * Get all global error interceptors (in registration order)
   * @internal
   */
  public getErrorInterceptors(): ErrorInterceptor[] {
    return this.errorInterceptors.map(item => item.interceptor);
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
    this.clearInterceptors();
    return this;
  }
}
