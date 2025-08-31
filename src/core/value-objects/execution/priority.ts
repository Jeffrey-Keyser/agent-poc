import { Result } from '../web/url';

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

/**
 * Value object representing task priority levels
 */
export class Priority {
  private constructor(
    private readonly level: PriorityLevel,
    private readonly numericValue: number
  ) {}

  static critical(): Priority {
    return new Priority('critical', 4);
  }

  static high(): Priority {
    return new Priority('high', 3);
  }

  static medium(): Priority {
    return new Priority('medium', 2);
  }

  static low(): Priority {
    return new Priority('low', 1);
  }

  static fromString(level: string): Result<Priority> {
    const normalized = level.toLowerCase().trim();
    
    switch (normalized) {
      case 'critical':
        return Result.ok(Priority.critical());
      case 'high':
        return Result.ok(Priority.high());
      case 'medium':
        return Result.ok(Priority.medium());
      case 'low':
        return Result.ok(Priority.low());
      default:
        return Result.fail(`Invalid priority level: ${level}`);
    }
  }

  static fromNumber(value: number): Result<Priority> {
    if (value === 4) return Result.ok(Priority.critical());
    if (value === 3) return Result.ok(Priority.high());
    if (value === 2) return Result.ok(Priority.medium());
    if (value === 1) return Result.ok(Priority.low());
    
    return Result.fail(`Invalid priority number: ${value}. Must be 1-4.`);
  }

  getLevel(): PriorityLevel {
    return this.level;
  }

  getNumericValue(): number {
    return this.numericValue;
  }

  toString(): string {
    return this.level;
  }

  /**
   * Checks if this priority is higher than another
   */
  isHigherThan(other: Priority): boolean {
    return this.numericValue > other.numericValue;
  }

  /**
   * Checks if this priority is lower than another
   */
  isLowerThan(other: Priority): boolean {
    return this.numericValue < other.numericValue;
  }

  /**
   * Checks if this priority is equal to another
   */
  equals(other: Priority): boolean {
    return this.level === other.level;
  }

  /**
   * Priority level checks
   */
  isCritical(): boolean {
    return this.level === 'critical';
  }

  isHigh(): boolean {
    return this.level === 'high';
  }

  isMedium(): boolean {
    return this.level === 'medium';
  }

  isLow(): boolean {
    return this.level === 'low';
  }

  /**
   * Checks if this priority requires immediate attention
   */
  requiresImmediateAttention(): boolean {
    return this.level === 'critical' || this.level === 'high';
  }

  /**
   * Returns a color representation for UI purposes
   */
  getColor(): string {
    switch (this.level) {
      case 'critical':
        return '#dc3545'; // red
      case 'high':
        return '#fd7e14'; // orange
      case 'medium':
        return '#ffc107'; // yellow
      case 'low':
        return '#28a745'; // green
    }
  }

  /**
   * Returns the next higher priority level
   */
  escalate(): Result<Priority> {
    switch (this.level) {
      case 'low':
        return Result.ok(Priority.medium());
      case 'medium':
        return Result.ok(Priority.high());
      case 'high':
        return Result.ok(Priority.critical());
      case 'critical':
        return Result.fail('Cannot escalate beyond critical priority');
    }
  }

  /**
   * Returns the next lower priority level
   */
  deescalate(): Result<Priority> {
    switch (this.level) {
      case 'critical':
        return Result.ok(Priority.high());
      case 'high':
        return Result.ok(Priority.medium());
      case 'medium':
        return Result.ok(Priority.low());
      case 'low':
        return Result.fail('Cannot deescalate below low priority');
    }
  }

  /**
   * Compares priorities for sorting (higher priority first)
   */
  static compare(a: Priority, b: Priority): number {
    return b.numericValue - a.numericValue;
  }
}