import { 
  StepId, 
  TaskId, 
  Confidence 
} from '../value-objects';
import { StepStatus, TaskResult, StepResult } from './status-types';
import { Result } from './result';
import { Task } from './task';
import { DomainEvent } from '../domain-events';

export class Step {
  private readonly id: StepId;
  private status: StepStatus;
  private readonly tasks: Task[] = [];
  private retryCount: number = 0;
  private readonly createdAt: Date;
  private updatedAt: Date;
  private startTime: Date | undefined;
  private endTime: Date | undefined;
  private readonly domainEvents: DomainEvent[] = [];

  constructor(
    id: StepId,
    public readonly description: string,
    private order: number,
    public readonly confidence: Confidence,
    private readonly maxRetries: number = 3
  ) {
    this.id = id;
    this.status = StepStatus.Pending;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    
    this.validateConstructorParams();
  }

  // Static factory method
  static create(
    id: StepId,
    description: string,
    order: number,
    confidence: Confidence,
    maxRetries: number = 3
  ): Result<Step> {
    if (!description.trim()) {
      return Result.fail('Step description cannot be empty');
    }

    if (order <= 0) {
      return Result.fail('Step order must be positive');
    }

    if (maxRetries < 0) {
      return Result.fail('Max retries cannot be negative');
    }

    return Result.ok(new Step(id, description, order, confidence, maxRetries));
  }

  // Getters
  getId(): StepId {
    return this.id;
  }

  getStatus(): StepStatus {
    return this.status;
  }

  getDescription(): string {
    return this.description;
  }

  getOrder(): number {
    return this.order;
  }

  getConfidence(): Confidence {
    return this.confidence;
  }

  getRetryCount(): number {
    return this.retryCount;
  }

  getMaxRetries(): number {
    return this.maxRetries;
  }

  getTasks(): ReadonlyArray<Task> {
    return this.tasks;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  getStartTime(): Date | undefined {
    return this.startTime;
  }

  getEndTime(): Date | undefined {
    return this.endTime;
  }

  // Status checks
  isComplete(): boolean {
    return this.status === StepStatus.Completed;
  }

  isFailed(): boolean {
    return this.status === StepStatus.Failed;
  }

  isRunning(): boolean {
    return this.status === StepStatus.Running;
  }

  isPending(): boolean {
    return this.status === StepStatus.Pending;
  }

  hasStarted(): boolean {
    return this.status !== StepStatus.Pending;
  }

  addTask(task: Task): Result<void> {
    if (this.status === StepStatus.Completed) {
      return Result.fail('Cannot add task to completed step');
    }

    // Check for duplicate task IDs
    if (this.tasks.some(t => t.getId().equals(task.getId()))) {
      return Result.fail('Task with this ID already exists in step');
    }

    this.tasks.push(task);
    this.updatedAt = new Date();
    
    return Result.ok();
  }

  removeTask(taskId: TaskId): Result<void> {
    if (this.status === StepStatus.Running) {
      return Result.fail('Cannot remove task from running step');
    }

    const taskIndex = this.tasks.findIndex(task => task.getId().equals(taskId));
    if (taskIndex === -1) {
      return Result.fail('Task not found in step');
    }

    this.tasks.splice(taskIndex, 1);
    this.updatedAt = new Date();
    
    return Result.ok();
  }

  getTaskById(taskId: TaskId): Task | undefined {
    return this.tasks.find(task => task.getId().equals(taskId));
  }

  getTasksByStatus(status: string): Task[] {
    return this.tasks.filter(task => task.getStatus() === status);
  }

  getPendingTasks(): Task[] {
    return this.getTasksByStatus('pending');
  }

  getRunningTasks(): Task[] {
    return this.getTasksByStatus('running');
  }

  getCompletedTasks(): Task[] {
    return this.getTasksByStatus('completed');
  }

  getFailedTasks(): Task[] {
    return this.getTasksByStatus('failed');
  }

  // Progress tracking
  getTaskProgress(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    percentage: number;
  } {
    const pending = this.getPendingTasks().length;
    const running = this.getRunningTasks().length;
    const completed = this.getCompletedTasks().length;
    const failed = this.getFailedTasks().length;
    const total = this.tasks.length;

    return {
      total,
      pending,
      running,
      completed,
      failed,
      percentage: total > 0 ? (completed / total) * 100 : 0
    };
  }

  start(): Result<void> {
    if (this.status !== StepStatus.Pending) {
      return Result.fail('Step is not in pending state');
    }

    if (this.tasks.length === 0) {
      return Result.fail('Cannot start step with no tasks');
    }

    this.status = StepStatus.Running;
    this.startTime = new Date();
    this.updatedAt = new Date();
    
    return Result.ok();
  }

  complete(): Result<void> {
    if (this.status !== StepStatus.Running) {
      return Result.fail('Step is not running');
    }

    // Check if all tasks are complete
    const incompleteTasks = this.tasks.filter(task => !task.isComplete() && !task.isFailed());
    if (incompleteTasks.length > 0) {
      return Result.fail(`Step has ${incompleteTasks.length} incomplete tasks`);
    }

    // Check if any critical tasks failed (this could be configurable per task)
    const failedTasks = this.getFailedTasks();
    const criticalFailures = failedTasks.filter(task => task.getPriority().isHigh());
    
    if (criticalFailures.length > 0) {
      return this.fail(`${criticalFailures.length} critical tasks failed`);
    }

    this.status = StepStatus.Completed;
    this.endTime = new Date();
    this.updatedAt = new Date();
    
    return Result.ok();
  }

  fail(reason: string): Result<void> {
    if (this.status === StepStatus.Completed) {
      return Result.fail('Cannot fail completed step');
    }

    this.status = StepStatus.Failed;
    this.endTime = new Date();
    this.updatedAt = new Date();
    
    // Log the reason (could emit domain event here)
    console.warn(`Step ${this.id.toString()} failed: ${reason}`);
    
    return Result.ok();
  }

  // Check if step can be completed
  canComplete(): boolean {
    if (this.status !== StepStatus.Running) {
      return false;
    }

    // All non-failed tasks must be complete
    const incompleteTasks = this.tasks.filter(task => 
      !task.isComplete() && !task.isFailed()
    );

    return incompleteTasks.length === 0;
  }

  // Get overall step confidence based on task results
  getOverallConfidence(): number {
    if (this.tasks.length === 0) {
      return this.confidence.getValue();
    }

    const completedTasks = this.getCompletedTasks();
    if (completedTasks.length === 0) {
      return this.confidence.getValue();
    }

    // Calculate weighted average of task confidences
    let totalConfidence = 0;
    let totalWeight = 0;

    for (const task of completedTasks) {
      const taskConfidence = task.getConfidence();
      if (taskConfidence) {
        const weight = task.getPriority().isHigh() ? 3 : 
                      task.getPriority().isMedium() ? 2 : 1;
        totalConfidence += taskConfidence.getValue() * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) {
      return this.confidence.getValue();
    }

    // Combine with original step confidence (weighted at 20%)
    const taskAverage = totalConfidence / totalWeight;
    const originalWeight = 0.2;
    const taskWeight = 0.8;

    return (this.confidence.getValue() * originalWeight) + (taskAverage * taskWeight);
  }

  // Get step execution duration
  getExecutionDuration(): number | undefined {
    if (!this.startTime) {
      return undefined;
    }

    const endTime = this.endTime || new Date();
    return endTime.getTime() - this.startTime.getTime();
  }

  // Update order (used when reordering steps in plan)
  updateOrder(newOrder: number): void {
    if (newOrder <= 0) {
      throw new Error('Step order must be positive');
    }

    this.order = newOrder;
    this.updatedAt = new Date();
  }

  // Get step result
  getResult(): StepResult | undefined {
    if (!this.isComplete() && !this.isFailed()) {
      return undefined;
    }

    const taskResults: TaskResult[] = this.tasks
      .filter(task => task.getResult())
      .map(task => task.getResult()!);

    return {
      stepId: this.id.toString(),
      success: this.isComplete(),
      taskResults,
      confidence: this.getOverallConfidence()
    };
  }

  // Validation methods
  private validateConstructorParams(): void {
    if (!this.description.trim()) {
      throw new Error('Step description cannot be empty');
    }

    if (this.order <= 0) {
      throw new Error('Step order must be positive');
    }
  }

  validateInvariants(): void {
    // Business rules that must always be true
    if (this.status === StepStatus.Running && !this.startTime) {
      throw new Error('Running step must have a start time');
    }

    if (this.status === StepStatus.Completed) {
      const incompleteTasks = this.tasks.filter(task => 
        !task.isComplete() && !task.isFailed()
      );
      if (incompleteTasks.length > 0) {
        throw new Error('Completed step cannot have incomplete tasks');
      }
    }

    if (this.endTime && this.startTime && this.endTime < this.startTime) {
      throw new Error('End time cannot be before start time');
    }

    if (this.order <= 0) {
      throw new Error('Step order must be positive');
    }

    // Retry count validation
    if (this.retryCount < 0) {
      throw new Error('Retry count cannot be negative');
    }

    if (this.retryCount > this.maxRetries) {
      throw new Error('Retry count cannot exceed max retries');
    }

    // State consistency validation for retries
    if (this.status === StepStatus.Pending && this.retryCount > 0 && this.startTime) {
      throw new Error('Pending step with retries should not have start time');
    }

    if (this.status === StepStatus.Failed && this.retryCount >= this.maxRetries && this.canRetry()) {
      throw new Error('Failed step at max retries should not be retryable');
    }

    // Validate task IDs are unique
    const taskIds = this.tasks.map(task => task.getId().toString());
    const uniqueIds = new Set(taskIds);
    if (taskIds.length !== uniqueIds.size) {
      throw new Error('Step contains duplicate task IDs');
    }
  }

  // Helper method to create a summary
  getSummary(): {
    id: string;
    status: StepStatus;
    description: string;
    order: number;
    confidence: number;
    taskProgress: {
      total: number;
      completed: number;
      failed: number;
      percentage: number;
    };
    overallConfidence: number;
    executionDuration: number | undefined;
  } {
    const taskProgress = this.getTaskProgress();
    
    return {
      id: this.id.toString(),
      status: this.status,
      description: this.description,
      order: this.order,
      confidence: this.confidence.getValue(),
      taskProgress: {
        total: taskProgress.total,
        completed: taskProgress.completed,
        failed: taskProgress.failed,
        percentage: taskProgress.percentage
      },
      overallConfidence: this.getOverallConfidence(),
      executionDuration: this.getExecutionDuration()
    };
  }

  // Retry logic
  canRetry(): boolean {
    return this.retryCount < this.maxRetries;
  }

  getRemainingRetries(): number {
    return Math.max(0, this.maxRetries - this.retryCount);
  }

  retry(): Result<void> {
    // Allow retry from FAILED state
    if (this.status !== StepStatus.Failed) {
      return Result.fail('Step must be in failed state to retry');
    }

    if (this.retryCount >= this.maxRetries) {
      return Result.fail('Maximum retry attempts exceeded');
    }

    this.retryCount++;
    this.status = StepStatus.Pending; // Reset to pending for re-execution
    this.startTime = undefined;
    this.endTime = undefined;
    this.updatedAt = new Date();

    // Reset all tasks in this step to pending state
    for (const task of this.tasks) {
      if (task.isFailed()) {
        const taskRetryResult = task.retry();
        if (taskRetryResult.isFailure()) {
          // If task can't be retried, reset it manually to pending
          // This is a fallback to ensure step can be retried
          console.warn(`Task ${task.getId().toString()} couldn't be retried: ${taskRetryResult.getError()}`);
        }
      }
    }

    // Note: Step events would be published by WorkflowManager which has the context
    // this.addDomainEvent(new StepRetriedEvent(...));

    return Result.ok();
  }

  resetForRetry(): Result<void> {
    if (this.status === StepStatus.Running) {
      return Result.fail('Cannot reset running step');
    }

    this.status = StepStatus.Pending;
    this.startTime = undefined;
    this.endTime = undefined;
    this.updatedAt = new Date();

    // Reset all tasks to pending
    for (const task of this.tasks) {
      if (!task.isPending()) {
        const taskRetryResult = task.retry();
        if (taskRetryResult.isFailure()) {
          console.warn(`Task ${task.getId().toString()} couldn't be reset: ${taskRetryResult.getError()}`);
        }
      }
    }

    return Result.ok();
  }

  // Domain events support - placeholder for future step events
  getDomainEvents(): ReadonlyArray<DomainEvent> {
    return this.domainEvents;
  }

  clearDomainEvents(): void {
    this.domainEvents.splice(0, this.domainEvents.length);
  }
}