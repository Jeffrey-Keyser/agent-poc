import { Result } from '../web/url';

/**
 * Value object representing a confidence score from 0 to 100
 */
export class Confidence {
  private constructor(private readonly value: number) {}

  static create(value: number): Result<Confidence> {
    if (value < 0 || value > 100) {
      return Result.fail('Confidence must be between 0 and 100');
    }

    if (!Number.isFinite(value)) {
      return Result.fail('Confidence must be a finite number');
    }

    return Result.ok(new Confidence(Math.round(value)));
  }

  static high(): Confidence {
    return new Confidence(90);
  }

  static medium(): Confidence {
    return new Confidence(70);
  }

  static low(): Confidence {
    return new Confidence(30);
  }

  static zero(): Confidence {
    return new Confidence(0);
  }

  static full(): Confidence {
    return new Confidence(100);
  }

  getValue(): number {
    return this.value;
  }

  toString(): string {
    return `${this.value}%`;
  }

  /**
   * Checks if confidence is high (>= 80)
   */
  isHigh(): boolean {
    return this.value >= 80;
  }

  /**
   * Checks if confidence is medium (50-79)
   */
  isMedium(): boolean {
    return this.value >= 50 && this.value < 80;
  }

  /**
   * Checks if confidence is low (< 50)
   */
  isLow(): boolean {
    return this.value < 50;
  }

  /**
   * Checks if confidence meets a minimum threshold
   */
  meetsThreshold(threshold: number): boolean {
    return this.value >= threshold;
  }

  /**
   * Returns a new confidence value increased by the specified amount
   */
  increase(amount: number): Result<Confidence> {
    return Confidence.create(this.value + amount);
  }

  /**
   * Returns a new confidence value decreased by the specified amount
   */
  decrease(amount: number): Result<Confidence> {
    return Confidence.create(this.value - amount);
  }

  /**
   * Returns a new confidence value multiplied by the specified factor
   */
  multiply(factor: number): Result<Confidence> {
    if (factor < 0) {
      return Result.fail('Factor cannot be negative');
    }
    return Confidence.create(this.value * factor);
  }

  /**
   * Combines this confidence with another using weighted average
   */
  combine(other: Confidence, weight: number = 0.5): Result<Confidence> {
    if (weight < 0 || weight > 1) {
      return Result.fail('Weight must be between 0 and 1');
    }

    const combined = this.value * weight + other.value * (1 - weight);
    return Confidence.create(combined);
  }

  equals(other: Confidence): boolean {
    return this.value === other.value;
  }

  /**
   * Compares confidence levels
   */
  isGreaterThan(other: Confidence): boolean {
    return this.value > other.value;
  }

  isLessThan(other: Confidence): boolean {
    return this.value < other.value;
  }

  /**
   * Returns the difference between this and another confidence
   */
  difference(other: Confidence): number {
    return Math.abs(this.value - other.value);
  }
}