import { Result } from '../entities/result';
import { ExecutionContext } from '../entities/execution-context';
import { ExecutionResult } from '../entities/execution-result';
import { Task } from '../entities/task';
import { TaskResult } from '../entities/status-types';
import { 
  TaskId,
  Evidence,
  PageState,
  Url,
  Viewport
} from '../value-objects';

// Execution statistics for analysis
export interface ExecutionStatistics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  averageDuration: number;
  fastExecutions: number;
  slowExecutions: number;
  retryExecutions: number;
  evidenceCount: number;
}

// Execution Aggregate - manages execution context and tracks execution results
export class ExecutionAggregate {
  constructor(
    private readonly context: ExecutionContext,
    private readonly results: ExecutionResult[] = []
  ) {
    this.validateAggregateConsistency();
  }

  // Static factory method
  static create(context: ExecutionContext): Result<ExecutionAggregate> {
    if (!context.isReady()) {
      return Result.fail('Execution context is not ready');
    }

    return Result.ok(new ExecutionAggregate(context, []));
  }

  // Static method to recreate from existing data
  static fromExistingData(
    context: ExecutionContext,
    results: ExecutionResult[]
  ): Result<ExecutionAggregate> {
    // Validate that all results belong to this context's workflow
    // In a real implementation, we'd validate workflow IDs match
    // For now, we assume they're consistent if context is valid
    
    return Result.ok(new ExecutionAggregate(context, [...results]));
  }

  // Getters
  getContext(): ExecutionContext {
    return this.context;
  }

  getResults(): ReadonlyArray<ExecutionResult> {
    return this.results;
  }

  getResultCount(): number {
    return this.results.length;
  }

  // Core aggregate operations
  recordExecution(task: Task, result: TaskResult, evidence?: Evidence, context?: string): Result<ExecutionResult> {
    // Validate task is ready for result recording
    if (task.getStatus() !== 'running' && task.getStatus() !== 'completed') {
      return Result.fail('Task must be running or completed to record result');
    }

    // Create execution result
    const executionResultCreation = ExecutionResult.create(
      task.getId(),
      result,
      evidence,
      context,
      task.getRetryCount()
    );

    if (executionResultCreation.isFailure()) {
      return Result.fail(`Failed to create execution result: ${executionResultCreation.getError()}`);
    }

    const executionResult = executionResultCreation.getValue();

    // Update execution context
    const contextUpdateResult = this.context.completeTaskExecution(result);
    if (contextUpdateResult.isFailure()) {
      return Result.fail(`Failed to update execution context: ${contextUpdateResult.getError()}`);
    }

    // Add to results
    this.results.push(executionResult);

    // Update context environment based on result if needed
    if (result.success && result.data) {
      this.updateContextFromResult(result);
    }

    this.validateInvariants();
    return Result.ok(executionResult);
  }

  startTaskExecution(task: Task): Result<void> {
    // Start task execution in context
    const startResult = this.context.startTaskExecution(task.getId());
    if (startResult.isFailure()) {
      return Result.fail(startResult.getError());
    }

    // Mark task as executing
    task.execute();

    this.validateInvariants();
    return Result.ok();
  }

  // Context management operations
  updateCurrentUrl(url: Url): Result<void> {
    return this.context.updateCurrentUrl(url);
  }

  updatePageState(pageState: PageState): Result<void> {
    return this.context.updatePageState(pageState);
  }

  updateViewport(viewport: Viewport): Result<void> {
    return this.context.updateViewport(viewport);
  }

  // Query operations
  getExecutionHistory(): ReadonlyArray<ExecutionResult> {
    return this.results;
  }

  getSuccessfulExecutions(): ExecutionResult[] {
    return this.results.filter(result => result.isSuccess());
  }

  getFailedExecutions(): ExecutionResult[] {
    return this.results.filter(result => result.isFailure());
  }

  getExecutionsByTaskId(taskId: TaskId): ExecutionResult[] {
    return this.results.filter(result => result.getTaskId().equals(taskId));
  }

  getExecutionsByTimeRange(startTime: Date, endTime: Date): ExecutionResult[] {
    return this.results.filter(result => {
      const executedAt = result.getExecutedAt();
      return executedAt >= startTime && executedAt <= endTime;
    });
  }

  getRecentExecutions(count: number = 10): ExecutionResult[] {
    return this.results.slice(-count);
  }

  getExecutionsWithEvidence(): ExecutionResult[] {
    return this.results.filter(result => result.hasEvidence());
  }

  getRetryExecutions(): ExecutionResult[] {
    return this.results.filter(result => result.isRetry());
  }

  getSlowExecutions(thresholdMs: number = 5000): ExecutionResult[] {
    return this.results.filter(result => result.isSlowExecution(thresholdMs));
  }

  getFastExecutions(thresholdMs: number = 1000): ExecutionResult[] {
    return this.results.filter(result => result.isFastExecution(thresholdMs));
  }

  // Analysis operations
  getExecutionStatistics(): ExecutionStatistics {
    const totalExecutions = this.results.length;
    const successfulExecutions = this.getSuccessfulExecutions().length;
    const failedExecutions = this.getFailedExecutions().length;
    const successRate = totalExecutions > 0 ? successfulExecutions / totalExecutions : 0;
    
    const averageDuration = totalExecutions > 0 
      ? this.results.reduce((sum, result) => sum + result.getDuration().getMilliseconds(), 0) / totalExecutions
      : 0;

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      successRate,
      averageDuration,
      fastExecutions: this.getFastExecutions().length,
      slowExecutions: this.getSlowExecutions().length,
      retryExecutions: this.getRetryExecutions().length,
      evidenceCount: this.getExecutionsWithEvidence().length
    };
  }

  getBestExecution(): ExecutionResult | undefined {
    if (this.results.length === 0) return undefined;

    return this.results.reduce((best, current) => 
      current.isBetterThan(best) ? current : best
    );
  }

  getWorstExecution(): ExecutionResult | undefined {
    if (this.results.length === 0) return undefined;

    return this.results.reduce((worst, current) => 
      !current.isBetterThan(worst) ? current : worst
    );
  }

  getTaskExecutionSummary(taskId: TaskId): {
    taskId: string;
    executionCount: number;
    successCount: number;
    failureCount: number;
    averageDuration: number;
    bestExecution?: ExecutionResult;
    worstExecution?: ExecutionResult;
  } | undefined {
    const taskExecutions = this.getExecutionsByTaskId(taskId);
    if (taskExecutions.length === 0) return undefined;

    const successCount = taskExecutions.filter(exec => exec.isSuccess()).length;
    const failureCount = taskExecutions.filter(exec => exec.isFailure()).length;
    const averageDuration = taskExecutions.reduce(
      (sum, exec) => sum + exec.getDuration().getMilliseconds(), 
      0
    ) / taskExecutions.length;

    const bestExecution = taskExecutions.reduce((best, current) => 
      current.isBetterThan(best) ? current : best
    );

    const worstExecution = taskExecutions.reduce((worst, current) => 
      !current.isBetterThan(worst) ? current : worst
    );

    return {
      taskId: taskId.toString(),
      executionCount: taskExecutions.length,
      successCount,
      failureCount,
      averageDuration,
      bestExecution,
      worstExecution
    };
  }

  // Performance analysis
  isPerformingWell(): boolean {
    const stats = this.getExecutionStatistics();
    
    // Consider performing well if:
    // 1. Success rate > 70%
    // 2. Average duration < 5 seconds
    // 3. Less than 30% slow executions
    
    if (stats.totalExecutions < 3) return true; // Not enough data
    
    return stats.successRate > 0.7 && 
           stats.averageDuration < 5000 && 
           (stats.slowExecutions / stats.totalExecutions) < 0.3;
  }

  needsOptimization(): boolean {
    const stats = this.getExecutionStatistics();
    
    // Needs optimization if:
    // 1. Success rate < 50%
    // 2. Average duration > 10 seconds
    // 3. More than 50% slow executions
    
    if (stats.totalExecutions < 5) return false; // Not enough data
    
    return stats.successRate < 0.5 || 
           stats.averageDuration > 10000 || 
           (stats.slowExecutions / stats.totalExecutions) > 0.5;
  }

  // Data export for analysis
  exportExecutionData(): {
    context: any;
    statistics: ExecutionStatistics;
    executionHistory: any[];
    performance: {
      isPerformingWell: boolean;
      needsOptimization: boolean;
      bestExecution?: any;
      worstExecution?: any;
    };
  } {
    return {
      context: this.context.getSnapshot(),
      statistics: this.getExecutionStatistics(),
      executionHistory: this.results.map(result => result.toJSON()),
      performance: {
        isPerformingWell: this.isPerformingWell(),
        needsOptimization: this.needsOptimization(),
        bestExecution: this.getBestExecution()?.toJSON(),
        worstExecution: this.getWorstExecution()?.toJSON()
      }
    };
  }

  // Private helper methods
  private updateContextFromResult(result: TaskResult): void {
    // Update context based on successful task result
    if (result.data) {
      // If result contains URL, update current URL
      if (result.data.currentUrl) {
        try {
          const url = Url.create(result.data.currentUrl);
          if (url.isSuccess()) {
            this.context.updateCurrentUrl(url.getValue());
          }
        } catch {
          // Ignore URL update errors
        }
      }

      // If result contains page state, update it
      if (result.data.pageState) {
        try {
          const pageState = result.data.pageState as PageState;
          this.context.updatePageState(pageState);
        } catch {
          // Ignore page state update errors
        }
      }

      // Update browser storage if available
      if (result.data.localStorage) {
        this.context.updateLocalStorage(result.data.localStorage);
      }

      if (result.data.sessionStorage) {
        this.context.updateSessionStorage(result.data.sessionStorage);
      }

      if (result.data.cookies) {
        this.context.updateCookies(result.data.cookies);
      }
    }
  }

  private validateAggregateConsistency(): void {
    // Validate that context and results are consistent
    // All results should be for the same workflow (in a full implementation)
    // For now, we just validate the context is ready
    if (!this.context.isReady() && this.results.length > 0) {
      throw new Error('Context must be ready when execution results exist');
    }
  }

  // Domain invariants validation
  private validateInvariants(): void {
    this.validateAggregateConsistency();
    this.context.validateInvariants();

    // Validate all execution results
    for (const result of this.results) {
      result.validateInvariants();
    }

    // Validate execution count consistency
    if (this.context.getExecutionCount() !== this.results.length) {
      throw new Error('Context execution count must match results array length');
    }
  }
}