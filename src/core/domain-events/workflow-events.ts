import { DomainEvent } from './base-events';
import { WorkflowId } from '../value-objects/identifiers/workflow-id';
import { PlanId } from '../value-objects/identifiers/plan-id';

/**
 * Event fired when a workflow is created
 */
export class WorkflowCreatedEvent extends DomainEvent {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly goal: string,
    public readonly startUrl: string,
    public readonly variables: Record<string, any> = {},
    occurredAt?: Date
  ) {
    super(workflowId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      workflowId: this.workflowId.toString(),
      goal: this.goal,
      startUrl: this.startUrl,
      variables: this.variables
    };
  }

  static fromJSON(data: Record<string, any>): WorkflowCreatedEvent {
    return new WorkflowCreatedEvent(
      new (WorkflowId as any)(data.workflowId),
      data.goal,
      data.startUrl,
      data.variables,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a workflow is started
 */
export class WorkflowStartedEvent extends DomainEvent {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly goal: string,
    public readonly sessionId?: string,
    occurredAt?: Date
  ) {
    super(workflowId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      workflowId: this.workflowId.toString(),
      goal: this.goal,
      sessionId: this.sessionId
    };
  }

  static fromJSON(data: Record<string, any>): WorkflowStartedEvent {
    return new WorkflowStartedEvent(
      new (WorkflowId as any)(data.workflowId),
      data.goal,
      data.sessionId,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a plan is created and attached to a workflow
 */
export class PlanCreatedEvent extends DomainEvent {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly planId: PlanId,
    public readonly stepCount: number,
    public readonly estimatedDuration?: number,
    public readonly complexity?: string,
    occurredAt?: Date
  ) {
    super(workflowId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      workflowId: this.workflowId.toString(),
      planId: this.planId.toString(),
      stepCount: this.stepCount,
      estimatedDuration: this.estimatedDuration,
      complexity: this.complexity
    };
  }

  static fromJSON(data: Record<string, any>): PlanCreatedEvent {
    return new PlanCreatedEvent(
      new (WorkflowId as any)(data.workflowId),
      new (PlanId as any)(data.planId),
      data.stepCount,
      data.estimatedDuration,
      data.complexity,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a workflow is completed successfully
 */
export class WorkflowCompletedEvent extends DomainEvent {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly summary: string,
    public readonly extractedData: any = null,
    public readonly duration: number,
    public readonly tasksCompleted: number,
    public readonly finalUrl?: string,
    occurredAt?: Date
  ) {
    super(workflowId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      workflowId: this.workflowId.toString(),
      summary: this.summary,
      extractedData: this.extractedData,
      duration: this.duration,
      tasksCompleted: this.tasksCompleted,
      finalUrl: this.finalUrl
    };
  }

  static fromJSON(data: Record<string, any>): WorkflowCompletedEvent {
    return new WorkflowCompletedEvent(
      new (WorkflowId as any)(data.workflowId),
      data.summary,
      data.extractedData,
      data.duration,
      data.tasksCompleted,
      data.finalUrl,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a workflow fails
 */
export class WorkflowFailedEvent extends DomainEvent {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly reason: string,
    public readonly error: Error | null = null,
    public readonly duration: number,
    public readonly tasksCompleted: number,
    public readonly failedAtStep?: number,
    occurredAt?: Date
  ) {
    super(workflowId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      workflowId: this.workflowId.toString(),
      reason: this.reason,
      error: this.error ? {
        message: this.error.message,
        stack: this.error.stack,
        name: this.error.name
      } : null,
      duration: this.duration,
      tasksCompleted: this.tasksCompleted,
      failedAtStep: this.failedAtStep
    };
  }

  static fromJSON(data: Record<string, any>): WorkflowFailedEvent {
    let error: Error | null = null;
    if (data.error) {
      error = new Error(data.error.message);
      error.name = data.error.name;
      error.stack = data.error.stack;
    }

    return new WorkflowFailedEvent(
      new (WorkflowId as any)(data.workflowId),
      data.reason,
      error,
      data.duration,
      data.tasksCompleted,
      data.failedAtStep,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a workflow is cancelled
 */
export class WorkflowCancelledEvent extends DomainEvent {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly reason: string,
    public readonly duration: number,
    public readonly tasksCompleted: number,
    occurredAt?: Date
  ) {
    super(workflowId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      workflowId: this.workflowId.toString(),
      reason: this.reason,
      duration: this.duration,
      tasksCompleted: this.tasksCompleted
    };
  }

  static fromJSON(data: Record<string, any>): WorkflowCancelledEvent {
    return new WorkflowCancelledEvent(
      new (WorkflowId as any)(data.workflowId),
      data.reason,
      data.duration,
      data.tasksCompleted,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a workflow is paused
 */
export class WorkflowPausedEvent extends DomainEvent {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly reason: string,
    public readonly currentStep: number,
    occurredAt?: Date
  ) {
    super(workflowId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      workflowId: this.workflowId.toString(),
      reason: this.reason,
      currentStep: this.currentStep
    };
  }

  static fromJSON(data: Record<string, any>): WorkflowPausedEvent {
    return new WorkflowPausedEvent(
      new (WorkflowId as any)(data.workflowId),
      data.reason,
      data.currentStep,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a workflow is resumed
 */
export class WorkflowResumedEvent extends DomainEvent {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly fromStep: number,
    occurredAt?: Date
  ) {
    super(workflowId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      workflowId: this.workflowId.toString(),
      fromStep: this.fromStep
    };
  }

  static fromJSON(data: Record<string, any>): WorkflowResumedEvent {
    return new WorkflowResumedEvent(
      new (WorkflowId as any)(data.workflowId),
      data.fromStep,
      new Date(data.occurredAt)
    );
  }
}