import { Result } from '../web/url';
import { Duration } from './duration';

export type BackoffStrategy = 'fixed' | 'exponential' | 'linear';

/**
 * Value object representing a retry policy configuration
 */
export class RetryPolicy {
  private constructor(
    public readonly maxRetries: number,
    public readonly baseDelay: Duration,
    public readonly maxDelay: Duration,
    public readonly backoffStrategy: BackoffStrategy,
    public readonly backoffMultiplier: number
  ) {}

  static create(params: {
    maxRetries: number;
    baseDelay: Duration;
    maxDelay?: Duration;
    backoffStrategy?: BackoffStrategy;
    backoffMultiplier?: number;
  }): Result<RetryPolicy> {
    if (params.maxRetries < 0) {
      return Result.fail('Max retries cannot be negative');
    }

    if (params.maxRetries > 10) {
      return Result.fail('Max retries cannot exceed 10 for safety');
    }

    const maxDelay = params.maxDelay || Duration.fromMinutes(5).getValue();
    const backoffStrategy = params.backoffStrategy || 'exponential';
    const backoffMultiplier = params.backoffMultiplier || 2;

    if (backoffMultiplier <= 1) {
      return Result.fail('Backoff multiplier must be greater than 1');
    }

    if (params.baseDelay.isLongerThan(maxDelay)) {
      return Result.fail('Base delay cannot be longer than max delay');
    }

    return Result.ok(new RetryPolicy(
      params.maxRetries,
      params.baseDelay,
      maxDelay,
      backoffStrategy,
      backoffMultiplier
    ));
  }

  /**
   * Common retry policy presets
   */
  static noRetry(): RetryPolicy {
    return new RetryPolicy(
      0,
      Duration.zero(),
      Duration.zero(),
      'fixed',
      1
    );
  }

  static immediate(): RetryPolicy {
    return new RetryPolicy(
      3,
      Duration.zero(),
      Duration.zero(),
      'fixed',
      1
    );
  }

  static quick(): RetryPolicy {
    return new RetryPolicy(
      3,
      Duration.fromSeconds(1).getValue(),
      Duration.fromSeconds(10).getValue(),
      'exponential',
      2
    );
  }

  static standard(): RetryPolicy {
    return new RetryPolicy(
      5,
      Duration.fromSeconds(2).getValue(),
      Duration.fromMinutes(1).getValue(),
      'exponential',
      2
    );
  }

  static patient(): RetryPolicy {
    return new RetryPolicy(
      10,
      Duration.fromSeconds(5).getValue(),
      Duration.fromMinutes(5).getValue(),
      'exponential',
      1.5
    );
  }

  /**
   * Calculates the delay for a specific retry attempt
   */
  getDelayForAttempt(attemptNumber: number): Duration {
    if (attemptNumber <= 0) {
      return Duration.zero();
    }

    let delay: Duration;

    switch (this.backoffStrategy) {
      case 'fixed':
        delay = this.baseDelay;
        break;
      case 'linear':
        delay = this.baseDelay.multiply(attemptNumber).getValue();
        break;
      case 'exponential':
        delay = this.baseDelay.multiply(Math.pow(this.backoffMultiplier, attemptNumber - 1)).getValue();
        break;
    }

    // Cap at max delay
    if (delay.isLongerThan(this.maxDelay)) {
      return this.maxDelay;
    }

    return delay;
  }

  /**
   * Checks if more retries are allowed
   */
  canRetry(currentAttempt: number): boolean {
    return currentAttempt < this.maxRetries;
  }

  /**
   * Returns the total time that could be spent on retries
   */
  getMaxTotalDelay(): Duration {
    let total = Duration.zero();
    
    for (let i = 1; i <= this.maxRetries; i++) {
      total = total.add(this.getDelayForAttempt(i)).getValue();
    }

    return total;
  }

  /**
   * Returns remaining retry attempts
   */
  getRemainingRetries(currentAttempt: number): number {
    return Math.max(0, this.maxRetries - currentAttempt);
  }

  equals(other: RetryPolicy): boolean {
    return (
      this.maxRetries === other.maxRetries &&
      this.baseDelay.equals(other.baseDelay) &&
      this.maxDelay.equals(other.maxDelay) &&
      this.backoffStrategy === other.backoffStrategy &&
      this.backoffMultiplier === other.backoffMultiplier
    );
  }

  toString(): string {
    if (this.maxRetries === 0) {
      return 'No retry';
    }

    return `${this.maxRetries} retries with ${this.backoffStrategy} backoff (base: ${this.baseDelay.toShortString()}, max: ${this.maxDelay.toShortString()})`;
  }

  /**
   * Creates a new retry policy with different max retries
   */
  withMaxRetries(maxRetries: number): Result<RetryPolicy> {
    return RetryPolicy.create({
      maxRetries,
      baseDelay: this.baseDelay,
      maxDelay: this.maxDelay,
      backoffStrategy: this.backoffStrategy,
      backoffMultiplier: this.backoffMultiplier,
    });
  }

  /**
   * Creates a new retry policy with different base delay
   */
  withBaseDelay(baseDelay: Duration): Result<RetryPolicy> {
    return RetryPolicy.create({
      maxRetries: this.maxRetries,
      baseDelay,
      maxDelay: this.maxDelay,
      backoffStrategy: this.backoffStrategy,
      backoffMultiplier: this.backoffMultiplier,
    });
  }

  /**
   * Checks if this is an aggressive retry policy
   */
  isAggressive(): boolean {
    return this.maxRetries >= 7 || this.baseDelay.isShorterThan(Duration.fromSeconds(1).getValue());
  }

  /**
   * Checks if this policy allows retries
   */
  allowsRetries(): boolean {
    return this.maxRetries > 0;
  }
}