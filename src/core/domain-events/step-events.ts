import { DomainEvent } from './base-events';
import { StepId } from '../value-objects/identifiers/step-id';
import { WorkflowId } from '../value-objects/identifiers/workflow-id';
import { PlanId } from '../value-objects/identifiers/plan-id';

/**
 * Event fired when a step is created
 */
export class StepCreatedEvent extends DomainEvent {
  constructor(
    public readonly stepId: StepId,
    public readonly planId: PlanId,
    public readonly workflowId: WorkflowId,
    public readonly description: string,
    public readonly order: number,
    public readonly confidence: number,
    public readonly estimatedDuration?: number,
    occurredAt?: Date
  ) {
    super(stepId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      stepId: this.stepId.toString(),
      planId: this.planId.toString(),
      workflowId: this.workflowId.toString(),
      description: this.description,
      order: this.order,
      confidence: this.confidence,
      estimatedDuration: this.estimatedDuration
    };
  }

  static fromJSON(data: Record<string, any>): StepCreatedEvent {
    return new StepCreatedEvent(
      new (StepId as any)(data.stepId),
      new (PlanId as any)(data.planId),
      new (WorkflowId as any)(data.workflowId),
      data.description,
      data.order,
      data.confidence,
      data.estimatedDuration,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a step execution starts
 */
export class StepStartedEvent extends DomainEvent {
  constructor(
    public readonly stepId: StepId,
    public readonly planId: PlanId,
    public readonly workflowId: WorkflowId,
    public readonly order: number,
    public readonly taskCount: number,
    occurredAt?: Date
  ) {
    super(stepId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      stepId: this.stepId.toString(),
      planId: this.planId.toString(),
      workflowId: this.workflowId.toString(),
      order: this.order,
      taskCount: this.taskCount
    };
  }

  static fromJSON(data: Record<string, any>): StepStartedEvent {
    return new StepStartedEvent(
      new (StepId as any)(data.stepId),
      new (PlanId as any)(data.planId),
      new (WorkflowId as any)(data.workflowId),
      data.order,
      data.taskCount,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a step is completed
 */
export class StepCompletedEvent extends DomainEvent {
  constructor(
    public readonly stepId: StepId,
    public readonly planId: PlanId,
    public readonly workflowId: WorkflowId,
    public readonly duration: number,
    public readonly tasksCompleted: number,
    public readonly tasksFailed: number,
    public readonly overallConfidence: number,
    public readonly summary?: string,
    occurredAt?: Date
  ) {
    super(stepId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      stepId: this.stepId.toString(),
      planId: this.planId.toString(),
      workflowId: this.workflowId.toString(),
      duration: this.duration,
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      overallConfidence: this.overallConfidence,
      summary: this.summary
    };
  }

  static fromJSON(data: Record<string, any>): StepCompletedEvent {
    return new StepCompletedEvent(
      new (StepId as any)(data.stepId),
      new (PlanId as any)(data.planId),
      new (WorkflowId as any)(data.workflowId),
      data.duration,
      data.tasksCompleted,
      data.tasksFailed,
      data.overallConfidence,
      data.summary,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a step fails
 */
export class StepFailedEvent extends DomainEvent {
  constructor(
    public readonly stepId: StepId,
    public readonly planId: PlanId,
    public readonly workflowId: WorkflowId,
    public readonly reason: string,
    public readonly duration: number,
    public readonly tasksCompleted: number,
    public readonly tasksFailed: number,
    public readonly criticalTask?: string,
    occurredAt?: Date
  ) {
    super(stepId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      stepId: this.stepId.toString(),
      planId: this.planId.toString(),
      workflowId: this.workflowId.toString(),
      reason: this.reason,
      duration: this.duration,
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      criticalTask: this.criticalTask
    };
  }

  static fromJSON(data: Record<string, any>): StepFailedEvent {
    return new StepFailedEvent(
      new (StepId as any)(data.stepId),
      new (PlanId as any)(data.planId),
      new (WorkflowId as any)(data.workflowId),
      data.reason,
      data.duration,
      data.tasksCompleted,
      data.tasksFailed,
      data.criticalTask,
      new Date(data.occurredAt)
    );
  }
}