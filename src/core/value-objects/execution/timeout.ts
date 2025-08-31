import { Result } from '../web/url';
import { Duration } from './duration';

export type TimeoutType = 'page-load' | 'element-wait' | 'action' | 'script' | 'network';

/**
 * Value object representing a timeout configuration
 */
export class Timeout {
  private constructor(
    public readonly duration: Duration,
    public readonly type: TimeoutType,
    public readonly description?: string
  ) {}

  static create(
    duration: Duration,
    type: TimeoutType,
    description?: string
  ): Result<Timeout> {
    if (duration.isZero()) {
      return Result.fail('Timeout duration cannot be zero');
    }

    if (duration.getHours() > 1) {
      return Result.fail('Timeout duration cannot exceed 1 hour');
    }

    return Result.ok(new Timeout(duration, type, description));
  }

  /**
   * Common timeout presets
   */
  static pageLoad(): Timeout {
    return new Timeout(
      Duration.fromSeconds(30).getValue(),
      'page-load',
      'Standard page load timeout'
    );
  }

  static elementWait(): Timeout {
    return new Timeout(
      Duration.fromSeconds(10).getValue(),
      'element-wait',
      'Standard element wait timeout'
    );
  }

  static action(): Timeout {
    return new Timeout(
      Duration.fromSeconds(5).getValue(),
      'action',
      'Standard action timeout'
    );
  }

  static script(): Timeout {
    return new Timeout(
      Duration.fromSeconds(30).getValue(),
      'script',
      'Standard script execution timeout'
    );
  }

  static network(): Timeout {
    return new Timeout(
      Duration.fromSeconds(10).getValue(),
      'network',
      'Standard network request timeout'
    );
  }

  static quick(): Timeout {
    return new Timeout(
      Duration.fromSeconds(2).getValue(),
      'action',
      'Quick timeout for fast operations'
    );
  }

  static long(): Timeout {
    return new Timeout(
      Duration.fromMinutes(2).getValue(),
      'page-load',
      'Long timeout for slow operations'
    );
  }

  /**
   * Creates timeout from milliseconds
   */
  static fromMilliseconds(ms: number, type: TimeoutType = 'action'): Result<Timeout> {
    const durationResult = Duration.fromMilliseconds(ms);
    if (!durationResult.isSuccess()) {
      return Result.fail(durationResult.getError());
    }

    return Timeout.create(durationResult.getValue(), type);
  }

  /**
   * Creates timeout from seconds
   */
  static fromSeconds(seconds: number, type: TimeoutType = 'action'): Result<Timeout> {
    const durationResult = Duration.fromSeconds(seconds);
    if (!durationResult.isSuccess()) {
      return Result.fail(durationResult.getError());
    }

    return Timeout.create(durationResult.getValue(), type);
  }

  getMilliseconds(): number {
    return this.duration.getMilliseconds();
  }

  getSeconds(): number {
    return this.duration.getSeconds();
  }

  toString(): string {
    const desc = this.description ? ` (${this.description})` : '';
    return `${this.type}: ${this.duration.toShortString()}${desc}`;
  }

  equals(other: Timeout): boolean {
    return (
      this.duration.equals(other.duration) &&
      this.type === other.type &&
      this.description === other.description
    );
  }

  /**
   * Checks if this timeout is longer than another
   */
  isLongerThan(other: Timeout): boolean {
    return this.duration.isLongerThan(other.duration);
  }

  /**
   * Checks if this timeout is shorter than another
   */
  isShorterThan(other: Timeout): boolean {
    return this.duration.isShorterThan(other.duration);
  }

  /**
   * Creates a new timeout with extended duration
   */
  extend(additionalTime: Duration): Result<Timeout> {
    const newDurationResult = this.duration.add(additionalTime);
    if (!newDurationResult.isSuccess()) {
      return Result.fail(newDurationResult.getError());
    }

    return Timeout.create(
      newDurationResult.getValue(),
      this.type,
      this.description
    );
  }

  /**
   * Creates a new timeout with reduced duration
   */
  reduce(reductionTime: Duration): Result<Timeout> {
    const newDurationResult = this.duration.subtract(reductionTime);
    if (!newDurationResult.isSuccess()) {
      return Result.fail(newDurationResult.getError());
    }

    return Timeout.create(
      newDurationResult.getValue(),
      this.type,
      this.description
    );
  }

  /**
   * Creates a new timeout with a multiplier
   */
  multiply(factor: number): Result<Timeout> {
    const newDurationResult = this.duration.multiply(factor);
    if (!newDurationResult.isSuccess()) {
      return Result.fail(newDurationResult.getError());
    }

    return Timeout.create(
      newDurationResult.getValue(),
      this.type,
      this.description
    );
  }

  /**
   * Checks if this timeout is appropriate for the given type
   */
  isAppropriateFor(type: TimeoutType): boolean {
    switch (type) {
      case 'page-load':
        return this.duration.getSeconds() >= 10 && this.duration.getSeconds() <= 120;
      case 'element-wait':
        return this.duration.getSeconds() >= 1 && this.duration.getSeconds() <= 30;
      case 'action':
        return this.duration.getSeconds() >= 1 && this.duration.getSeconds() <= 15;
      case 'script':
        return this.duration.getSeconds() >= 5 && this.duration.getSeconds() <= 60;
      case 'network':
        return this.duration.getSeconds() >= 2 && this.duration.getSeconds() <= 30;
      default:
        return true;
    }
  }

  /**
   * Checks if this is a very short timeout
   */
  isVeryShort(): boolean {
    return this.duration.getSeconds() < 2;
  }

  /**
   * Checks if this is a very long timeout
   */
  isVeryLong(): boolean {
    return this.duration.getMinutes() > 5;
  }

  /**
   * Returns a warning if the timeout seems inappropriate
   */
  getWarning(): string | undefined {
    if (!this.isAppropriateFor(this.type)) {
      if (this.isVeryShort()) {
        return `Timeout of ${this.duration.toShortString()} may be too short for ${this.type}`;
      } else if (this.isVeryLong()) {
        return `Timeout of ${this.duration.toShortString()} may be too long for ${this.type}`;
      }
    }
    return undefined;
  }
}