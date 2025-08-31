export class Result<T> {
  private constructor(
    private readonly success: boolean,
    private readonly error?: string,
    private readonly value?: T
  ) {}

  static ok<T>(value?: T): Result<T> {
    return new Result<T>(true, undefined, value);
  }

  static fail<T>(error: string): Result<T> {
    return new Result<T>(false, error);
  }

  isSuccess(): boolean {
    return this.success;
  }

  isFailure(): boolean {
    return !this.success;
  }

  getValue(): T {
    if (!this.success) {
      throw new Error(`Cannot get value from failed result: ${this.error}`);
    }
    return this.value!;
  }

  getError(): string {
    if (this.success) {
      throw new Error('Cannot get error from successful result');
    }
    return this.error!;
  }

  getValueOrNull(): T | null {
    return this.success ? this.value! : null;
  }
}