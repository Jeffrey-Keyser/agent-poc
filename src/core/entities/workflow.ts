import { 
  WorkflowId, 
  TaskId,
  Variable,
  Url
} from '../value-objects';
import { 
  WorkflowStatus, 
  WorkflowResult, 
  TaskResult 
} from './status-types';
import { Result } from './result';
import { Plan } from './plan';
import { Task } from './task';

// Domain events for workflow
export interface DomainEvent {
  aggregateId: string;
  occurredAt: Date;
}

export class WorkflowStartedEvent implements DomainEvent {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly goal: string,
    public readonly aggregateId: string = workflowId.toString(),
    public readonly occurredAt: Date = new Date()
  ) {}
}

export class WorkflowCompletedEvent implements DomainEvent {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly result: WorkflowResult,
    public readonly aggregateId: string = workflowId.toString(),
    public readonly occurredAt: Date = new Date()
  ) {}
}

export class WorkflowFailedEvent implements DomainEvent {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly reason: string,
    public readonly aggregateId: string = workflowId.toString(),
    public readonly occurredAt: Date = new Date()
  ) {}
}

// Execution history to track workflow progress
export class ExecutionHistory {
  private readonly entries: Array<{
    taskId: TaskId;
    result: TaskResult;
    timestamp: Date;
  }> = [];

  addEntry(taskId: TaskId, result: TaskResult): void {
    this.entries.push({
      taskId,
      result,
      timestamp: new Date()
    });
  }

  getEntries(): ReadonlyArray<{
    taskId: TaskId;
    result: TaskResult;
    timestamp: Date;
  }> {
    return this.entries;
  }

  getLastEntry(): { taskId: TaskId; result: TaskResult; timestamp: Date } | undefined {
    return this.entries[this.entries.length - 1];
  }

  getSuccessfulTasks(): number {
    return this.entries.filter(entry => entry.result.success).length;
  }

  getFailedTasks(): number {
    return this.entries.filter(entry => !entry.result.success).length;
  }
}

export class Workflow {
  private readonly id: WorkflowId;
  private status: WorkflowStatus;
  private readonly createdAt: Date;
  private updatedAt: Date;
  private plan?: Plan;
  private currentTask?: Task;
  private readonly executionHistory: ExecutionHistory;
  private readonly domainEvents: DomainEvent[] = [];
  private completionSummary?: string;
  private extractedData?: any;

  constructor(
    id: WorkflowId,
    public readonly goal: string,
    public readonly startUrl: Url,
    public readonly variables: ReadonlyArray<Variable>
  ) {
    this.id = id;
    this.status = WorkflowStatus.Pending;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.executionHistory = new ExecutionHistory();
  }

  // Getters
  getId(): WorkflowId {
    return this.id;
  }

  getStatus(): WorkflowStatus {
    return this.status;
  }

  getPlan(): Plan | undefined {
    return this.plan;
  }

  getCurrentTask(): Task | undefined {
    return this.currentTask;
  }

  getExecutionHistory(): ExecutionHistory {
    return this.executionHistory;
  }

  getDomainEvents(): ReadonlyArray<DomainEvent> {
    return this.domainEvents;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  isComplete(): boolean {
    return this.status === WorkflowStatus.Completed;
  }

  isFailed(): boolean {
    return this.status === WorkflowStatus.Failed;
  }

  isRunning(): boolean {
    return this.status === WorkflowStatus.Running;
  }

  getCompletionSummary(): string | undefined {
    return this.completionSummary;
  }

  getExtractedData(): any {
    return this.extractedData;
  }

  // Domain methods
  start(): Result<void> {
    if (this.status !== WorkflowStatus.Pending) {
      return Result.fail('Workflow already started or completed');
    }

    this.status = WorkflowStatus.Running;
    this.updatedAt = new Date();
    this.recordEvent(new WorkflowStartedEvent(this.id, this.goal));
    
    return Result.ok();
  }

  attachPlan(plan: Plan): Result<void> {
    if (this.status === WorkflowStatus.Completed || this.status === WorkflowStatus.Failed) {
      return Result.fail('Cannot attach plan to completed or failed workflow');
    }

    if (!plan.getWorkflowId().equals(this.id)) {
      return Result.fail('Plan does not belong to this workflow');
    }

    this.plan = plan;
    this.updatedAt = new Date();
    
    return Result.ok();
  }

  executeNextTask(): Result<Task> {
    if (this.status !== WorkflowStatus.Running) {
      return Result.fail('Workflow is not in running state');
    }

    if (!this.plan) {
      return Result.fail('No plan attached to workflow');
    }

    const currentStep = this.plan.getCurrentStep();
    if (!currentStep) {
      return Result.fail('No current step in plan');
    }

    const tasks = currentStep.getTasks();
    if (tasks.length === 0) {
      return Result.fail('Current step has no tasks');
    }

    // Find next pending task
    const nextTask = tasks.find(task => task.getStatus() === 'pending');
    if (!nextTask) {
      // Try to advance to next step
      const advanceResult = this.plan.advance();
      if (advanceResult.isFailure()) {
        return Result.fail('No more tasks or steps to execute');
      }
      
      // Try again with new step
      const newStep = this.plan.getCurrentStep();
      if (!newStep) {
        return Result.fail('No next step available');
      }
      
      const newTasks = newStep.getTasks();
      const newNextTask = newTasks.find(task => task.getStatus() === 'pending');
      if (!newNextTask) {
        return Result.fail('No pending tasks in next step');
      }
      
      this.currentTask = newNextTask;
      return Result.ok(newNextTask);
    }

    this.currentTask = nextTask;
    return Result.ok(nextTask);
  }

  recordTaskResult(taskId: TaskId, result: TaskResult): void {
    this.executionHistory.addEntry(taskId, result);
    this.updatedAt = new Date();
  }

  complete(summary: string, extractedData?: any): Result<void> {
    if (this.status !== WorkflowStatus.Running) {
      return Result.fail('Workflow is not running');
    }

    if (this.plan && !this.plan.isComplete()) {
      return Result.fail('Cannot complete workflow with incomplete plan');
    }

    this.status = WorkflowStatus.Completed;
    this.completionSummary = summary;
    this.extractedData = extractedData;
    this.updatedAt = new Date();

    const workflowResult: WorkflowResult = {
      workflowId: this.id.toString(),
      success: true,
      extractedData,
      summary,
      duration: this.updatedAt.getTime() - this.createdAt.getTime()
    };

    this.recordEvent(new WorkflowCompletedEvent(this.id, workflowResult));
    
    return Result.ok();
  }

  fail(reason: string): Result<void> {
    if (this.status === WorkflowStatus.Completed) {
      return Result.fail('Cannot fail completed workflow');
    }

    this.status = WorkflowStatus.Failed;
    this.completionSummary = `Failed: ${reason}`;
    this.updatedAt = new Date();
    this.recordEvent(new WorkflowFailedEvent(this.id, reason));
    
    return Result.ok();
  }

  cancel(): Result<void> {
    if (this.status === WorkflowStatus.Completed || this.status === WorkflowStatus.Failed) {
      return Result.fail('Cannot cancel completed or failed workflow');
    }

    this.status = WorkflowStatus.Cancelled;
    this.updatedAt = new Date();
    
    return Result.ok();
  }

  // Domain invariants validation
  validateInvariants(): void {
    if (this.status === WorkflowStatus.Completed && this.plan && !this.plan.isComplete()) {
      throw new Error('Workflow cannot be complete with incomplete plan');
    }

    if (this.status === WorkflowStatus.Running && !this.plan) {
      throw new Error('Running workflow must have an attached plan');
    }
  }

  private recordEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  // Clear events after publishing (would be called by event publisher)
  clearDomainEvents(): void {
    this.domainEvents.splice(0, this.domainEvents.length);
  }
}