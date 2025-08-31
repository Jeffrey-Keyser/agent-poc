import { 
  TaskId, 
  Intent, 
  Priority, 
  Confidence,
  Evidence 
} from '../value-objects';
import { TaskStatus, TaskResult } from './status-types';
import { Result } from './result';

export interface TaskExecutionContext {
  retryCount: number;
  maxRetries: number;
  timeout: number;
  startTime: Date | undefined;
  endTime: Date | undefined;
}

export class Task {
  private readonly id: TaskId;
  private status: TaskStatus;
  private retryCount: number = 0;
  private result: TaskResult | undefined;
  private error: Error | undefined;
  private readonly createdAt: Date;
  private updatedAt: Date;
  private startTime: Date | undefined;
  private endTime: Date | undefined;
  private evidence: Evidence[] = [];

  constructor(
    id: TaskId,
    public readonly intent: Intent,
    public readonly description: string,
    public readonly priority: Priority,
    private readonly maxRetries: number = 3,
    private readonly timeoutMs: number = 30000
  ) {
    this.id = id;
    this.status = TaskStatus.Pending;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    
    this.validateConstructorParams();
  }

  // Static factory method
  static create(
    id: TaskId,
    intent: Intent,
    description: string,
    priority: Priority,
    maxRetries: number = 3,
    timeoutMs: number = 30000
  ): Result<Task> {
    if (!description.trim()) {
      return Result.fail('Task description cannot be empty');
    }

    if (maxRetries < 0) {
      return Result.fail('Max retries cannot be negative');
    }

    if (timeoutMs <= 0) {
      return Result.fail('Timeout must be positive');
    }

    return Result.ok(new Task(id, intent, description, priority, maxRetries, timeoutMs));
  }

  // Getters
  getId(): TaskId {
    return this.id;
  }

  getStatus(): TaskStatus {
    return this.status;
  }

  getIntent(): Intent {
    return this.intent;
  }

  getDescription(): string {
    return this.description;
  }

  getPriority(): Priority {
    return this.priority;
  }

  getRetryCount(): number {
    return this.retryCount;
  }

  getMaxRetries(): number {
    return this.maxRetries;
  }

  getResult(): TaskResult | undefined {
    return this.result;
  }

  getError(): Error | undefined {
    return this.error;
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

  getEvidence(): ReadonlyArray<Evidence> {
    return this.evidence;
  }

  getExecutionContext(): TaskExecutionContext {
    return {
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      timeout: this.timeoutMs,
      startTime: this.startTime,
      endTime: this.endTime
    };
  }

  // Status checks
  isComplete(): boolean {
    return this.status === TaskStatus.Completed;
  }

  isFailed(): boolean {
    return this.status === TaskStatus.Failed;
  }

  isRunning(): boolean {
    return this.status === TaskStatus.Running;
  }

  isPending(): boolean {
    return this.status === TaskStatus.Pending;
  }

  isRetrying(): boolean {
    return this.status === TaskStatus.Retrying;
  }

  // Domain methods
  execute(): Result<void> {
    if (this.status === TaskStatus.Running) {
      return Result.fail('Task is already running');
    }

    if (this.status === TaskStatus.Completed) {
      return Result.fail('Task is already completed');
    }

    if (this.status === TaskStatus.Failed && !this.canRetry()) {
      return Result.fail('Task has failed and cannot be retried');
    }

    this.status = TaskStatus.Running;
    this.startTime = new Date();
    this.updatedAt = new Date();
    this.error = undefined; // Clear previous error

    return Result.ok();
  }

  complete(result: TaskResult, evidence?: Evidence[]): Result<void> {
    if (this.status !== TaskStatus.Running) {
      return Result.fail('Task is not running');
    }

    // Validate result
    if (result.success === undefined || result.success === null) {
      return Result.fail('Task result must specify success status');
    }

    this.status = TaskStatus.Completed;
    this.result = result;
    this.endTime = new Date();
    this.updatedAt = new Date();

    if (evidence) {
      this.evidence = [...evidence];
    }

    return Result.ok();
  }

  fail(error: Error, evidence?: Evidence[]): Result<void> {
    if (this.status !== TaskStatus.Running && this.status !== TaskStatus.Retrying) {
      return Result.fail('Task is not running or retrying');
    }

    this.error = error;
    this.endTime = new Date();
    this.updatedAt = new Date();

    if (evidence) {
      this.evidence = [...evidence];
    }

    if (this.canRetry()) {
      this.status = TaskStatus.Retrying;
      this.retryCount++;
      return Result.ok();
    }

    this.status = TaskStatus.Failed;
    
    // Create failed result
    this.result = {
      taskId: this.id.toString(),
      success: false,
      error: error.message,
      confidence: 0,
      timestamp: new Date()
    };

    return Result.ok();
  }

  retry(): Result<void> {
    if (this.status !== TaskStatus.Retrying) {
      return Result.fail('Task is not in retrying state');
    }

    if (!this.canRetry()) {
      return Result.fail('Task cannot be retried - max retries reached');
    }

    // Reset for retry
    this.status = TaskStatus.Pending;
    this.startTime = undefined;
    this.endTime = undefined;
    this.error = undefined;
    this.result = undefined;
    this.evidence = [];
    this.updatedAt = new Date();

    return Result.ok();
  }

  canRetry(): boolean {
    return this.retryCount < this.maxRetries;
  }

  getRemainingRetries(): number {
    return Math.max(0, this.maxRetries - this.retryCount);
  }

  addEvidence(evidence: Evidence): void {
    this.evidence.push(evidence);
    this.updatedAt = new Date();
  }

  clearEvidence(): void {
    this.evidence = [];
    this.updatedAt = new Date();
  }

  // Calculate execution duration
  getExecutionDuration(): number | undefined {
    if (!this.startTime) {
      return undefined;
    }

    const endTime = this.endTime || new Date();
    return endTime.getTime() - this.startTime.getTime();
  }

  hasTimedOut(): boolean {
    if (!this.startTime || this.status !== TaskStatus.Running) {
      return false;
    }

    const now = new Date();
    return (now.getTime() - this.startTime.getTime()) > this.timeoutMs;
  }

  // Get task confidence based on priority and success rate
  getConfidence(): Confidence | undefined {
    if (!this.result) {
      return undefined;
    }

    // Use confidence from result if available
    if (this.result.confidence !== undefined) {
      const confidenceResult = Confidence.create(this.result.confidence);
      return confidenceResult.isSuccess() ? confidenceResult.getValue() : undefined;
    }

    // Calculate confidence based on priority and retries
    let baseConfidence = 50; // Default confidence
    
    if (this.priority.isHigh()) {
      baseConfidence = 80;
    } else if (this.priority.isMedium()) {
      baseConfidence = 60;
    }

    // Reduce confidence for each retry
    const confidenceReduction = this.retryCount * 10;
    const finalConfidence = Math.max(0, baseConfidence - confidenceReduction);

    const confidenceResult = Confidence.create(finalConfidence);
    return confidenceResult.isSuccess() ? confidenceResult.getValue() : undefined;
  }

  // Validation methods
  private validateConstructorParams(): void {
    if (!this.description.trim()) {
      throw new Error('Task description cannot be empty');
    }

    if (this.maxRetries < 0) {
      throw new Error('Max retries cannot be negative');
    }

    if (this.timeoutMs <= 0) {
      throw new Error('Timeout must be positive');
    }
  }

  validateInvariants(): void {
    // Business rules that must always be true
    if (this.status === TaskStatus.Completed && !this.result) {
      throw new Error('Completed task must have a result');
    }

    if (this.status === TaskStatus.Failed && !this.error && (!this.result || this.result.success)) {
      throw new Error('Failed task must have an error or failed result');
    }

    if (this.status === TaskStatus.Running && !this.startTime) {
      throw new Error('Running task must have a start time');
    }

    if (this.retryCount > this.maxRetries) {
      throw new Error('Retry count cannot exceed max retries');
    }

    if (this.endTime && this.startTime && this.endTime < this.startTime) {
      throw new Error('End time cannot be before start time');
    }
  }

  // Helper method to create a summary
  getSummary(): {
    id: string;
    status: TaskStatus;
    description: string;
    priority: string;
    retryCount: number;
    maxRetries: number;
    hasResult: boolean;
    executionDuration: number | undefined;
    confidence: number | undefined;
  } {
    const confidence = this.getConfidence();
    
    return {
      id: this.id.toString(),
      status: this.status,
      description: this.description,
      priority: this.priority.toString(),
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      hasResult: !!this.result,
      executionDuration: this.getExecutionDuration(),
      confidence: confidence?.getValue()
    };
  }
}