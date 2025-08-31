import { v4 as uuid } from 'uuid';

/**
 * Type-safe identifier for Step entities
 */
export class StepId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('StepId cannot be empty');
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: StepId): boolean {
    return this.value === other.value;
  }

  static generate(): StepId {
    return new StepId(uuid());
  }

  static fromString(value: string): StepId {
    return new StepId(value);
  }
}