import { v4 as uuid } from 'uuid';

/**
 * Type-safe identifier for Plan entities
 */
export class PlanId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('PlanId cannot be empty');
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: PlanId): boolean {
    return this.value === other.value;
  }

  static generate(): PlanId {
    return new PlanId(uuid());
  }

  static fromString(value: string): PlanId {
    return new PlanId(value);
  }
}