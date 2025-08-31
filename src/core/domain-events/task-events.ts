import { DomainEvent } from './base-events';
import { TaskId } from '../value-objects/identifiers/task-id';
import { StepId } from '../value-objects/identifiers/step-id';
import { WorkflowId } from '../value-objects/identifiers/workflow-id';

/**
 * Event fired when a task is created
 */
export class TaskCreatedEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly stepId: StepId,
    public readonly workflowId: WorkflowId,
    public readonly intent: string,
    public readonly description: string,
    public readonly priority: string,
    occurredAt?: Date
  ) {
    super(taskId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      taskId: this.taskId.toString(),
      stepId: this.stepId.toString(),
      workflowId: this.workflowId.toString(),
      intent: this.intent,
      description: this.description,
      priority: this.priority
    };
  }

  static fromJSON(data: Record<string, any>): TaskCreatedEvent {
    return new TaskCreatedEvent(
      new (TaskId as any)(data.taskId),
      new (StepId as any)(data.stepId),
      new (WorkflowId as any)(data.workflowId),
      data.intent,
      data.description,
      data.priority,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a task execution starts
 */
export class TaskStartedEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly stepId: StepId,
    public readonly workflowId: WorkflowId,
    public readonly attempt: number = 1,
    public readonly context?: Record<string, any>,
    occurredAt?: Date
  ) {
    super(taskId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      taskId: this.taskId.toString(),
      stepId: this.stepId.toString(),
      workflowId: this.workflowId.toString(),
      attempt: this.attempt,
      context: this.context
    };
  }

  static fromJSON(data: Record<string, any>): TaskStartedEvent {
    return new TaskStartedEvent(
      new (TaskId as any)(data.taskId),
      new (StepId as any)(data.stepId),
      new (WorkflowId as any)(data.workflowId),
      data.attempt,
      data.context,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a task is completed successfully
 */
export class TaskCompletedEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly stepId: StepId,
    public readonly workflowId: WorkflowId,
    public readonly result: TaskResult,
    public readonly duration: number,
    public readonly confidence: number,
    public readonly evidence?: any,
    occurredAt?: Date
  ) {
    super(taskId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      taskId: this.taskId.toString(),
      stepId: this.stepId.toString(),
      workflowId: this.workflowId.toString(),
      result: this.result,
      duration: this.duration,
      confidence: this.confidence,
      evidence: this.evidence
    };
  }

  static fromJSON(data: Record<string, any>): TaskCompletedEvent {
    return new TaskCompletedEvent(
      new (TaskId as any)(data.taskId),
      new (StepId as any)(data.stepId),
      new (WorkflowId as any)(data.workflowId),
      data.result,
      data.duration,
      data.confidence,
      data.evidence,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a task fails
 */
export class TaskFailedEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly stepId: StepId,
    public readonly workflowId: WorkflowId,
    public readonly error: Error,
    public readonly duration: number,
    public readonly attempt: number,
    public readonly willRetry: boolean,
    public readonly context?: Record<string, any>,
    occurredAt?: Date
  ) {
    super(taskId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      taskId: this.taskId.toString(),
      stepId: this.stepId.toString(),
      workflowId: this.workflowId.toString(),
      error: {
        message: this.error.message,
        stack: this.error.stack,
        name: this.error.name
      },
      duration: this.duration,
      attempt: this.attempt,
      willRetry: this.willRetry,
      context: this.context
    };
  }

  static fromJSON(data: Record<string, any>): TaskFailedEvent {
    const error = new Error(data.error.message);
    error.name = data.error.name;
    error.stack = data.error.stack;

    return new TaskFailedEvent(
      new (TaskId as any)(data.taskId),
      new (StepId as any)(data.stepId),
      new (WorkflowId as any)(data.workflowId),
      error,
      data.duration,
      data.attempt,
      data.willRetry,
      data.context,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a task is retried
 */
export class TaskRetriedEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly stepId: StepId,
    public readonly workflowId: WorkflowId,
    public readonly attempt: number,
    public readonly previousError: string,
    public readonly retryDelay: number,
    occurredAt?: Date
  ) {
    super(taskId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      taskId: this.taskId.toString(),
      stepId: this.stepId.toString(),
      workflowId: this.workflowId.toString(),
      attempt: this.attempt,
      previousError: this.previousError,
      retryDelay: this.retryDelay
    };
  }

  static fromJSON(data: Record<string, any>): TaskRetriedEvent {
    return new TaskRetriedEvent(
      new (TaskId as any)(data.taskId),
      new (StepId as any)(data.stepId),
      new (WorkflowId as any)(data.workflowId),
      data.attempt,
      data.previousError,
      data.retryDelay,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a task times out
 */
export class TaskTimedOutEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly stepId: StepId,
    public readonly workflowId: WorkflowId,
    public readonly timeout: number,
    public readonly attempt: number,
    public readonly willRetry: boolean,
    occurredAt?: Date
  ) {
    super(taskId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      taskId: this.taskId.toString(),
      stepId: this.stepId.toString(),
      workflowId: this.workflowId.toString(),
      timeout: this.timeout,
      attempt: this.attempt,
      willRetry: this.willRetry
    };
  }

  static fromJSON(data: Record<string, any>): TaskTimedOutEvent {
    return new TaskTimedOutEvent(
      new (TaskId as any)(data.taskId),
      new (StepId as any)(data.stepId),
      new (WorkflowId as any)(data.workflowId),
      data.timeout,
      data.attempt,
      data.willRetry,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Task result interface for events
 */
export interface TaskResult {
  taskId: string;
  success: boolean;
  data?: any;
  duration?: number;
  timestamp: Date;
  confidence?: number;
  evidence?: any;
  extractedData?: any;
  screenshot?: string;
  pageUrl?: string;
  error?: string;
}