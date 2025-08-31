import { 
  SessionId, 
  WorkflowId, 
  Duration 
} from '../value-objects';
import { SessionStatus, BrowserConfig } from './status-types';
import { Result } from './result';

export interface SessionMetrics {
  tasksExecuted: number;
  tasksSucceeded: number;
  tasksFailed: number;
  averageTaskDuration: number;
  totalExecutionTime: number;
  errorCount: number;
  lastActivity: Date;
}

export interface SessionError {
  timestamp: Date;
  error: Error;
  context: string | undefined;
  recoverable: boolean;
}

export class Session {
  private readonly id: SessionId;
  private status: SessionStatus;
  private readonly startedAt: Date;
  private endedAt: Date | undefined;
  private lastActivity: Date;
  private readonly errors: SessionError[] = [];
  private readonly metrics: SessionMetrics;

  constructor(
    id: SessionId,
    public readonly workflowId: WorkflowId,
    public readonly browserConfig: BrowserConfig
  ) {
    this.id = id;
    this.status = SessionStatus.Active;
    this.startedAt = new Date();
    this.lastActivity = new Date();
    
    // Initialize metrics
    this.metrics = {
      tasksExecuted: 0,
      tasksSucceeded: 0,
      tasksFailed: 0,
      averageTaskDuration: 0,
      totalExecutionTime: 0,
      errorCount: 0,
      lastActivity: this.lastActivity
    };

    this.validateBrowserConfig();
  }

  // Static factory method
  static create(
    id: SessionId,
    workflowId: WorkflowId,
    browserConfig: BrowserConfig
  ): Result<Session> {
    // Validate browser config
    if (browserConfig.viewport.width <= 0 || browserConfig.viewport.height <= 0) {
      return Result.fail('Browser viewport dimensions must be positive');
    }

    if (browserConfig.timeout <= 0) {
      return Result.fail('Browser timeout must be positive');
    }

    return Result.ok(new Session(id, workflowId, browserConfig));
  }

  // Getters
  getId(): SessionId {
    return this.id;
  }

  getStatus(): SessionStatus {
    return this.status;
  }

  getWorkflowId(): WorkflowId {
    return this.workflowId;
  }

  getBrowserConfig(): BrowserConfig {
    return { ...this.browserConfig }; // Return copy to maintain immutability
  }

  getStartedAt(): Date {
    return this.startedAt;
  }

  getEndedAt(): Date | undefined {
    return this.endedAt;
  }

  getLastActivity(): Date {
    return this.lastActivity;
  }

  getErrors(): ReadonlyArray<SessionError> {
    return this.errors;
  }

  getMetrics(): SessionMetrics {
    return { ...this.metrics }; // Return copy to maintain immutability
  }

  // Status checks
  isActive(): boolean {
    return this.status === SessionStatus.Active;
  }

  isEnded(): boolean {
    return this.status === SessionStatus.Ended;
  }

  isError(): boolean {
    return this.status === SessionStatus.Error;
  }

  // Duration calculations
  getDuration(): Duration {
    const end = this.endedAt || new Date();
    const durationResult = Duration.between(this.startedAt, end);
    return durationResult.isSuccess() ? durationResult.getValue() : Duration.zero();
  }

  getIdleDuration(): Duration {
    const now = new Date();
    const durationResult = Duration.between(this.lastActivity, now);
    return durationResult.isSuccess() ? durationResult.getValue() : Duration.zero();
  }

  isIdle(thresholdMs: number = 300000): boolean { // 5 minutes default
    return this.getIdleDuration().getMilliseconds() > thresholdMs;
  }

  // Session lifecycle methods
  end(): Result<void> {
    if (this.status === SessionStatus.Ended) {
      return Result.fail('Session is already ended');
    }

    if (this.status === SessionStatus.Error) {
      return Result.fail('Cannot end session in error state');
    }

    this.status = SessionStatus.Ended;
    this.endedAt = new Date();
    this.updateLastActivity();
    
    return Result.ok();
  }

  markError(error: Error, context?: string, recoverable: boolean = false): Result<void> {
    const sessionError: SessionError = {
      timestamp: new Date(),
      error,
      context: context || undefined,
      recoverable
    };

    this.errors.push(sessionError);
    this.metrics.errorCount++;
    
    if (!recoverable) {
      this.status = SessionStatus.Error;
      this.endedAt = new Date();
    }

    this.updateLastActivity();
    
    return Result.ok();
  }

  recover(): Result<void> {
    if (this.status !== SessionStatus.Error) {
      return Result.fail('Session is not in error state');
    }

    // Check if the last error was recoverable
    const lastError = this.errors[this.errors.length - 1];
    if (!lastError || !lastError.recoverable) {
      return Result.fail('Session cannot be recovered from non-recoverable error');
    }

    this.status = SessionStatus.Active;
    this.endedAt = undefined;
    this.updateLastActivity();
    
    return Result.ok();
  }

  // Activity tracking
  updateLastActivity(): void {
    this.lastActivity = new Date();
    this.metrics.lastActivity = this.lastActivity;
  }

  // Metrics updates
  recordTaskExecution(success: boolean, duration: number): void {
    this.metrics.tasksExecuted++;
    
    if (success) {
      this.metrics.tasksSucceeded++;
    } else {
      this.metrics.tasksFailed++;
    }

    // Update average task duration
    const totalDuration = this.metrics.averageTaskDuration * (this.metrics.tasksExecuted - 1) + duration;
    this.metrics.averageTaskDuration = totalDuration / this.metrics.tasksExecuted;
    
    this.metrics.totalExecutionTime += duration;
    this.updateLastActivity();
  }

  // Error analysis
  getRecoverableErrors(): SessionError[] {
    return this.errors.filter(error => error.recoverable);
  }

  getNonRecoverableErrors(): SessionError[] {
    return this.errors.filter(error => !error.recoverable);
  }

  getErrorsByTimeRange(startTime: Date, endTime: Date): SessionError[] {
    return this.errors.filter(error => 
      error.timestamp >= startTime && error.timestamp <= endTime
    );
  }

  getRecentErrors(minutes: number = 30): SessionError[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.errors.filter(error => error.timestamp >= cutoff);
  }

  // Success rate calculations
  getTaskSuccessRate(): number {
    if (this.metrics.tasksExecuted === 0) {
      return 0;
    }
    return this.metrics.tasksSucceeded / this.metrics.tasksExecuted;
  }

  getTaskFailureRate(): number {
    if (this.metrics.tasksExecuted === 0) {
      return 0;
    }
    return this.metrics.tasksFailed / this.metrics.tasksExecuted;
  }

  // Session health assessment
  isHealthy(): boolean {
    // Consider session healthy if:
    // 1. Not in error state
    // 2. Success rate > 50%
    // 3. Not too many recent errors
    
    if (this.status === SessionStatus.Error) {
      return false;
    }

    const successRate = this.getTaskSuccessRate();
    if (successRate < 0.5 && this.metrics.tasksExecuted > 5) {
      return false;
    }

    const recentErrors = this.getRecentErrors(10); // Last 10 minutes
    if (recentErrors.length > 5) {
      return false;
    }

    return true;
  }

  // Configuration validation
  private validateBrowserConfig(): void {
    if (this.browserConfig.viewport.width <= 0 || this.browserConfig.viewport.height <= 0) {
      throw new Error('Browser viewport dimensions must be positive');
    }

    if (this.browserConfig.timeout <= 0) {
      throw new Error('Browser timeout must be positive');
    }
  }

  // Domain invariants validation
  validateInvariants(): void {
    if (this.status === SessionStatus.Ended && !this.endedAt) {
      throw new Error('Ended session must have end time');
    }

    if (this.endedAt && this.endedAt < this.startedAt) {
      throw new Error('End time cannot be before start time');
    }

    if (this.lastActivity < this.startedAt) {
      throw new Error('Last activity cannot be before start time');
    }

    if (this.metrics.tasksExecuted < 0) {
      throw new Error('Tasks executed cannot be negative');
    }

    if (this.metrics.tasksSucceeded + this.metrics.tasksFailed > this.metrics.tasksExecuted) {
      throw new Error('Sum of succeeded and failed tasks cannot exceed total executed');
    }

    this.validateBrowserConfig();
  }

  // Helper method to create a summary
  getSummary(): {
    id: string;
    status: SessionStatus;
    workflowId: string;
    duration: number;
    isHealthy: boolean;
    metrics: {
      tasksExecuted: number;
      successRate: number;
      failureRate: number;
      averageTaskDuration: number;
      errorCount: number;
    };
    browserConfig: BrowserConfig;
  } {
    return {
      id: this.id.toString(),
      status: this.status,
      workflowId: this.workflowId.toString(),
      duration: this.getDuration().getMilliseconds(),
      isHealthy: this.isHealthy(),
      metrics: {
        tasksExecuted: this.metrics.tasksExecuted,
        successRate: this.getTaskSuccessRate(),
        failureRate: this.getTaskFailureRate(),
        averageTaskDuration: this.metrics.averageTaskDuration,
        errorCount: this.metrics.errorCount
      },
      browserConfig: this.getBrowserConfig()
    };
  }
}