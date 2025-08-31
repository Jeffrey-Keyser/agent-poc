import { 
  TaskId,
  Evidence,
  Duration
} from '../value-objects';
import { TaskResult } from './status-types';
import { Result } from './result';

// Execution Result Entity - tracks detailed execution results with context
export class ExecutionResult {
  private readonly id: string;
  private readonly taskId: TaskId;
  private readonly result: TaskResult;
  private readonly executedAt: Date;
  private readonly duration: Duration;
  private readonly evidence: Evidence | undefined;
  private readonly context: string | undefined;
  private readonly retryAttempt: number;

  constructor(
    taskId: TaskId,
    result: TaskResult,
    executedAt: Date = new Date(),
    evidence?: Evidence,
    context?: string,
    retryAttempt: number = 0
  ) {
    this.id = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.taskId = taskId;
    this.result = { ...result }; // Copy to maintain immutability
    this.executedAt = executedAt;
    this.evidence = evidence;
    this.context = context;
    this.retryAttempt = retryAttempt;
    
    // Create duration from result or calculate from timestamp
    if (result.duration) {
      this.duration = Duration.fromMilliseconds(result.duration).getValue();
    } else {
      this.duration = Duration.fromMilliseconds(1000).getValue(); // Default 1 second
    }
  }

  // Static factory method
  static create(
    taskId: TaskId,
    result: TaskResult,
    evidence?: Evidence,
    context?: string,
    retryAttempt: number = 0
  ): Result<ExecutionResult> {
    // Validate inputs
    if (!result.taskId || result.taskId !== taskId.toString()) {
      return Result.fail('Task result ID must match provided task ID');
    }

    if (result.duration && result.duration < 0) {
      return Result.fail('Execution duration cannot be negative');
    }

    if (retryAttempt < 0) {
      return Result.fail('Retry attempt cannot be negative');
    }

    return Result.ok(new ExecutionResult(
      taskId,
      result,
      new Date(),
      evidence,
      context,
      retryAttempt
    ));
  }

  // Getters
  getId(): string {
    return this.id;
  }

  getTaskId(): TaskId {
    return this.taskId;
  }

  getResult(): TaskResult {
    return { ...this.result }; // Return copy to maintain immutability
  }

  getExecutedAt(): Date {
    return this.executedAt;
  }

  getDuration(): Duration {
    return this.duration;
  }

  getEvidence(): Evidence | undefined {
    return this.evidence;
  }

  getContext(): string | undefined {
    return this.context;
  }

  getRetryAttempt(): number {
    return this.retryAttempt;
  }

  // Result analysis methods
  isSuccess(): boolean {
    return this.result.success;
  }

  isFailure(): boolean {
    return !this.result.success;
  }

  hasError(): boolean {
    return this.result.error !== undefined;
  }

  getError(): string | undefined {
    return this.result.error;
  }

  hasData(): boolean {
    return this.result.data !== undefined;
  }

  getData(): any {
    return this.result.data;
  }

  hasEvidence(): boolean {
    return this.evidence !== undefined;
  }

  isRetry(): boolean {
    return this.retryAttempt > 0;
  }

  // Duration analysis
  isSlowExecution(thresholdMs: number = 5000): boolean {
    return this.duration.getMilliseconds() > thresholdMs;
  }

  isFastExecution(thresholdMs: number = 1000): boolean {
    return this.duration.getMilliseconds() < thresholdMs;
  }

  getDurationInSeconds(): number {
    return Math.round(this.duration.getMilliseconds() / 1000 * 100) / 100;
  }

  // Comparison methods
  isSuccessAfterRetry(): boolean {
    return this.isSuccess() && this.isRetry();
  }

  isFailureAfterRetry(): boolean {
    return this.isFailure() && this.isRetry();
  }

  // Result categorization
  getResultCategory(): 'success' | 'retry_success' | 'failure' | 'retry_failure' {
    if (this.isSuccess()) {
      return this.isRetry() ? 'retry_success' : 'success';
    } else {
      return this.isRetry() ? 'retry_failure' : 'failure';
    }
  }

  // Performance metrics
  getPerformanceRating(): 'excellent' | 'good' | 'fair' | 'poor' {
    if (!this.isSuccess()) return 'poor';
    
    const durationMs = this.duration.getMilliseconds();
    
    if (durationMs < 1000) return 'excellent';
    if (durationMs < 3000) return 'good';
    if (durationMs < 10000) return 'fair';
    return 'poor';
  }

  // Evidence analysis
  getEvidenceScore(): number {
    if (!this.evidence) return 0;
    
    // Use evidence methods to calculate a confidence score
    if (this.evidence.hasConfidence()) {
      return (this.evidence.getConfidence() || 0) / 100;
    }
    
    // Return a basic score based on evidence type
    switch (this.evidence.type) {
      case 'screenshot':
        return 0.8;
      case 'element':
        return 0.7;
      case 'text':
        return 0.6;
      case 'html':
        return 0.5;
      default:
        return 0.5;
    }
  }

  // Data serialization
  toJSON(): {
    id: string;
    taskId: string;
    result: TaskResult;
    executedAt: string;
    duration: number;
    evidence?: any;
    context: string | undefined;
    retryAttempt: number;
    isSuccess: boolean;
    category: string;
    performanceRating: string;
    evidenceScore: number;
  } {
    return {
      id: this.id,
      taskId: this.taskId.toString(),
      result: this.result,
      executedAt: this.executedAt.toISOString(),
      duration: this.duration.getMilliseconds(),
      evidence: this.evidence ? this.evidence.getSummary() : undefined,
      context: this.context,
      retryAttempt: this.retryAttempt,
      isSuccess: this.isSuccess(),
      category: this.getResultCategory(),
      performanceRating: this.getPerformanceRating(),
      evidenceScore: this.getEvidenceScore()
    };
  }

  // Summary for reporting
  getSummary(): {
    taskId: string;
    success: boolean;
    duration: number;
    retryAttempt: number;
    hasEvidence: boolean;
    errorMessage: string | undefined;
    performanceRating: string;
  } {
    return {
      taskId: this.taskId.toString(),
      success: this.isSuccess(),
      duration: this.getDurationInSeconds(),
      retryAttempt: this.retryAttempt,
      hasEvidence: this.hasEvidence(),
      errorMessage: this.getError(),
      performanceRating: this.getPerformanceRating()
    };
  }

  // Comparison with other execution results
  isBetterThan(other: ExecutionResult): boolean {
    // First priority: success vs failure
    if (this.isSuccess() && !other.isSuccess()) return true;
    if (!this.isSuccess() && other.isSuccess()) return false;
    
    // If both have same success status, compare by duration
    if (this.isSuccess() && other.isSuccess()) {
      return this.duration.getMilliseconds() < other.duration.getMilliseconds();
    }
    
    // If both failed, the one with fewer retries is better
    return this.retryAttempt < other.retryAttempt;
  }

  // Domain invariants validation
  validateInvariants(): void {
    if (this.retryAttempt < 0) {
      throw new Error('Retry attempt cannot be negative');
    }

    if (this.duration.getMilliseconds() < 0) {
      throw new Error('Duration cannot be negative');
    }

    if (this.result.taskId !== this.taskId.toString()) {
      throw new Error('Result task ID must match execution result task ID');
    }

    if (this.result.duration && this.result.duration !== this.duration.getMilliseconds()) {
      throw new Error('Result duration must match execution result duration');
    }

    // Validate that timestamp is reasonable
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const hourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    
    if (this.executedAt < hourAgo || this.executedAt > hourFromNow) {
      throw new Error('Execution timestamp must be within reasonable time range');
    }
  }
}