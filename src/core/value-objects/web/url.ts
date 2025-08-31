/**
 * Result type for operations that can fail
 */
export class Result<T> {
  private constructor(
    private readonly success: boolean,
    private readonly value?: T,
    private readonly error?: string
  ) {}

  static ok<T>(value: T): Result<T> {
    return new Result(true, value);
  }

  static fail<T>(error: string): Result<T> {
    return new Result<T>(false, undefined, error);
  }

  isSuccess(): boolean {
    return this.success;
  }

  getValue(): T {
    if (!this.success) {
      throw new Error(`Cannot get value from failed result: ${this.error}`);
    }
    return this.value!;
  }

  getError(): string {
    return this.error || 'Unknown error';
  }
}

/**
 * Value object representing a validated URL
 */
export class Url {
  private constructor(private readonly value: string) {}

  static create(value: string): Result<Url> {
    if (!value || value.trim().length === 0) {
      return Result.fail('URL cannot be empty');
    }

    try {
      new URL(value);
    } catch (error) {
      return Result.fail('Invalid URL format');
    }

    return Result.ok(new Url(value));
  }

  toString(): string {
    return this.value;
  }

  getHost(): string {
    const url = new URL(this.value);
    return url.hostname;
  }

  getPath(): string {
    const url = new URL(this.value);
    return url.pathname;
  }

  getProtocol(): string {
    const url = new URL(this.value);
    return url.protocol;
  }

  getSearchParams(): URLSearchParams {
    const url = new URL(this.value);
    return url.searchParams;
  }

  /**
   * Returns a new URL with a different path
   */
  withPath(path: string): Result<Url> {
    const url = new URL(this.value);
    url.pathname = path;
    return Url.create(url.toString());
  }

  /**
   * Returns a new URL with additional search parameters
   */
  withSearchParam(key: string, value: string): Result<Url> {
    const url = new URL(this.value);
    url.searchParams.set(key, value);
    return Url.create(url.toString());
  }

  equals(other: Url): boolean {
    return this.value === other.value;
  }

  /**
   * Checks if this URL is from the same origin as another
   */
  isSameOrigin(other: Url): boolean {
    const thisUrl = new URL(this.value);
    const otherUrl = new URL(other.value);
    
    return thisUrl.origin === otherUrl.origin;
  }

  /**
   * Checks if this URL uses HTTPS protocol
   */
  isSecure(): boolean {
    return this.getProtocol() === 'https:';
  }
}