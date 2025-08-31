import { v4 as uuid } from 'uuid';

/**
 * Type-safe identifier for Session entities
 */
export class SessionId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('SessionId cannot be empty');
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: SessionId): boolean {
    return this.value === other.value;
  }

  static generate(): SessionId {
    return new SessionId(uuid());
  }

  static fromString(value: string): SessionId {
    return new SessionId(value);
  }
}