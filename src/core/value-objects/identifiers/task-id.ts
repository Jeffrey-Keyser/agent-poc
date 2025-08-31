import { v4 as uuid } from 'uuid';

/**
 * Type-safe identifier for Task entities
 */
export class TaskId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('TaskId cannot be empty');
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: TaskId): boolean {
    return this.value === other.value;
  }

  static generate(): TaskId {
    return new TaskId(uuid());
  }

  static fromString(value: string): TaskId {
    return new TaskId(value);
  }
}