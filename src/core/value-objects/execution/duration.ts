import { Result } from '../web/url';

export type TimeUnit = 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days';

/**
 * Value object representing a time duration
 */
export class Duration {
  private constructor(private readonly milliseconds: number) {}

  static fromMilliseconds(ms: number): Result<Duration> {
    if (ms < 0) {
      return Result.fail('Duration cannot be negative');
    }

    if (!Number.isFinite(ms) || !Number.isInteger(ms)) {
      return Result.fail('Duration must be a finite integer');
    }

    return Result.ok(new Duration(ms));
  }

  static fromSeconds(seconds: number): Result<Duration> {
    return Duration.fromMilliseconds(seconds * 1000);
  }

  static fromMinutes(minutes: number): Result<Duration> {
    return Duration.fromMilliseconds(minutes * 60 * 1000);
  }

  static fromHours(hours: number): Result<Duration> {
    return Duration.fromMilliseconds(hours * 60 * 60 * 1000);
  }

  static fromDays(days: number): Result<Duration> {
    return Duration.fromMilliseconds(days * 24 * 60 * 60 * 1000);
  }

  static zero(): Duration {
    return new Duration(0);
  }

  /**
   * Creates a Duration from two Date objects
   */
  static between(start: Date, end: Date): Result<Duration> {
    const diff = end.getTime() - start.getTime();
    return Duration.fromMilliseconds(Math.abs(diff));
  }

  /**
   * Parses a duration string like "5s", "2m", "1h", "3d"
   */
  static parse(duration: string): Result<Duration> {
    const match = duration.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
    
    if (!match) {
      return Result.fail('Invalid duration format. Use format like "5s", "2m", "1h", "3d"');
    }

    const value = parseFloat(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'ms':
        return Duration.fromMilliseconds(value);
      case 's':
        return Duration.fromSeconds(value);
      case 'm':
        return Duration.fromMinutes(value);
      case 'h':
        return Duration.fromHours(value);
      case 'd':
        return Duration.fromDays(value);
      default:
        return Result.fail(`Unknown time unit: ${unit}`);
    }
  }

  getMilliseconds(): number {
    return this.milliseconds;
  }

  getSeconds(): number {
    return this.milliseconds / 1000;
  }

  getMinutes(): number {
    return this.milliseconds / (60 * 1000);
  }

  getHours(): number {
    return this.milliseconds / (60 * 60 * 1000);
  }

  getDays(): number {
    return this.milliseconds / (24 * 60 * 60 * 1000);
  }

  /**
   * Returns a human-readable string representation
   */
  toString(): string {
    if (this.milliseconds === 0) {
      return '0ms';
    }

    const days = Math.floor(this.getDays());
    const hours = Math.floor(this.getHours()) % 24;
    const minutes = Math.floor(this.getMinutes()) % 60;
    const seconds = Math.floor(this.getSeconds()) % 60;
    const ms = this.milliseconds % 1000;

    const parts: string[] = [];
    
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);
    if (ms > 0 && parts.length === 0) parts.push(`${ms}ms`);

    return parts.join(' ') || '0ms';
  }

  /**
   * Returns the largest appropriate unit
   */
  toShortString(): string {
    if (this.milliseconds === 0) return '0ms';
    
    if (this.getDays() >= 1) {
      return `${this.getDays().toFixed(1)}d`;
    } else if (this.getHours() >= 1) {
      return `${this.getHours().toFixed(1)}h`;
    } else if (this.getMinutes() >= 1) {
      return `${this.getMinutes().toFixed(1)}m`;
    } else if (this.getSeconds() >= 1) {
      return `${this.getSeconds().toFixed(1)}s`;
    } else {
      return `${this.milliseconds}ms`;
    }
  }

  equals(other: Duration): boolean {
    return this.milliseconds === other.milliseconds;
  }

  /**
   * Duration comparison
   */
  isLongerThan(other: Duration): boolean {
    return this.milliseconds > other.milliseconds;
  }

  isShorterThan(other: Duration): boolean {
    return this.milliseconds < other.milliseconds;
  }

  /**
   * Duration arithmetic
   */
  add(other: Duration): Result<Duration> {
    return Duration.fromMilliseconds(this.milliseconds + other.milliseconds);
  }

  subtract(other: Duration): Result<Duration> {
    const result = this.milliseconds - other.milliseconds;
    if (result < 0) {
      return Result.fail('Cannot subtract longer duration from shorter duration');
    }
    return Duration.fromMilliseconds(result);
  }

  multiply(factor: number): Result<Duration> {
    if (factor < 0) {
      return Result.fail('Cannot multiply duration by negative factor');
    }
    return Duration.fromMilliseconds(this.milliseconds * factor);
  }

  divide(divisor: number): Result<Duration> {
    if (divisor <= 0) {
      return Result.fail('Cannot divide duration by zero or negative number');
    }
    return Duration.fromMilliseconds(this.milliseconds / divisor);
  }

  /**
   * Checks if duration is within reasonable bounds
   */
  isReasonable(): boolean {
    // Less than 1 year
    return this.milliseconds <= 365 * 24 * 60 * 60 * 1000;
  }

  /**
   * Checks if this is a zero duration
   */
  isZero(): boolean {
    return this.milliseconds === 0;
  }
}