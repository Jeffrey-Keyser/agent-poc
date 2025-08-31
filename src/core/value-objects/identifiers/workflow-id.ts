import { v4 as uuid } from 'uuid';

/**
 * Type-safe identifier for Workflow entities
 */
export class WorkflowId {
  constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('WorkflowId cannot be empty');
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: WorkflowId): boolean {
    return this.value === other.value;
  }

  static generate(): WorkflowId {
    return new WorkflowId(uuid());
  }

  static fromString(value: string): WorkflowId {
    return new WorkflowId(value);
  }
}