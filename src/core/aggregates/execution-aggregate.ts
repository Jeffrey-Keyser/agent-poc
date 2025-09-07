import { Result } from '../entities/result';
import { ExecutionContext } from '../entities/execution-context';
import { ExecutionResult } from '../entities/execution-result';
import { Task } from '../entities/task';
import { TaskResult } from '../entities/status-types';
import { 
  TaskId,
  Evidence,
  PageState as PageStateVO,
  Url,
  Viewport
} from '../value-objects';
import { PageState as PageStateType } from '../types/agent-types';
import { DomainEvent } from '../domain-events';
import { StateManager } from '../services/state-manager';

export interface ExecutionStatistics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  retryExecutions: number;
  evidenceCount: number;
}

export class ExecutionAggregate {
  private readonly domainEvents: DomainEvent[] = [];

  constructor(
    private readonly context: ExecutionContext,
    private readonly results: ExecutionResult[] = [],
    private readonly stateManager: StateManager
  ) {
    this.validateAggregateConsistency();
  }

  static create(context: ExecutionContext, stateManager: StateManager): Result<ExecutionAggregate> {
    if (!context.isReady()) {
      return Result.fail('Execution context is not ready');
    }

    return Result.ok(new ExecutionAggregate(context, [], stateManager));
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

  // Core aggregate operations - Enhanced with StateManager integration
  async recordExecution(
    task: Task, 
    result: TaskResult, 
    evidence?: Evidence, 
    context?: string
  ): Promise<Result<ExecutionResult>> {
    // Validate task is ready for result recording
    if (task.getStatus() !== 'running' && task.getStatus() !== 'completed') {
      return Result.fail('Task must be running or completed to record result');
    }

    // Capture current state before recording
    const currentState = this.stateManager?.getCurrentState() || null;
    
    // Create checkpoint before recording if successful
    if (this.stateManager && result.success) {
      this.stateManager.createCheckpoint(`task-${task.getId()}-complete`);
    }

    // Create execution result with state context
    const executionResultCreation = ExecutionResult.create(
      task.getId(),
      result,
      evidence,
      context || this.buildContextFromState(currentState),
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

    // Update state context with new state
    if (this.stateManager) {
      try {
        const newState = await this.stateManager.captureState();
        // Convert PageStateType to PageStateVO for ExecutionContext
        const pageStateVO = PageStateVO.create({
          url: Url.create(newState.url).getValue(),
          title: newState.title,
          html: '',
          elements: [],
          loadTime: 0
        });
        this.updatePageState(pageStateVO);
        
        // Detect significant state changes
        if (currentState && this.stateManager.hasStateChanged(currentState, newState)) {
          this.recordStateChange(currentState, newState);
        }
      } catch (error) {
        // Log but don't fail execution if state capture fails
        console.warn('Failed to capture state after task execution:', error);
      }
    }

    this.validateInvariants();
    return Result.ok(executionResult);
  }

  startTaskExecution(task: Task): Result<void> {
    // Start task execution in context
    // TODO: Implement
    // const startResult = this.context.startTaskExecution(task.getId());
    // if (startResult.isFailure()) {
    //   return Result.fail(startResult.getError());
    // }

    // Mark task as executing
    task.execute();

    this.validateInvariants();
    return Result.ok();
  }

  // Context management operations
  updateCurrentUrl(url: Url): Result<void> {
    return this.context.updateCurrentUrl(url);
  }

  updatePageState(pageState: PageStateVO): Result<void> {
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

  getExecutionStatistics(): ExecutionStatistics {
    const totalExecutions = this.results.length;
    const successfulExecutions = this.getSuccessfulExecutions().length;
    const failedExecutions = this.getFailedExecutions().length;

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
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
          const pageState = result.data.pageState as PageStateVO;
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
    
    // Only validate context readiness if we're not in a valid transition state
    // Valid states:
    // 1. No results and no current task (ready state)
    // 2. Results exist and no current task (ready after completion)
    // 3. Results exist and current task running (valid execution state)
    // Invalid state would be: no results but task is running (shouldn't happen)
    
    const hasResults = this.results.length > 0;
    const isTaskRunning = this.context.isTaskRunning();
    const hasValidDimensions = this.context.getEnvironment().viewport.width > 0 && 
                              this.context.getEnvironment().viewport.height > 0;
    const hasValidUrl = this.context.getEnvironment().currentUrl !== undefined;
    
    // Check for invalid state: task running but no results (shouldn't start without proper setup)
    if (isTaskRunning && !hasResults && !hasValidDimensions) {
      throw new Error('Context has invalid state: task running without proper environment setup');
    }
    
    // Check for basic environment validity
    if (!hasValidUrl) {
      throw new Error('Context must have a valid URL');
    }
    
    if (!hasValidDimensions) {
      throw new Error('Context must have valid viewport dimensions');
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

  // Domain events support
  getDomainEvents(): ReadonlyArray<DomainEvent> {
    return this.domainEvents;
  }

  clearDomainEvents(): void {
    this.domainEvents.splice(0, this.domainEvents.length);
  }

  // Helper method to build context from state
  private buildContextFromState(state: PageStateType | null): string {
    if (!state) {
      return 'No state available';
    }
    
    return `Page: ${state.title} (${state.url}) - Sections: ${state.visibleSections.join(', ')} - Actions: ${state.availableActions.join(', ')}`;
  }

  // Helper method to record state changes
  private recordStateChange(previousState: PageStateType, newState: PageStateType): void {
    // Update execution context with state change information
    try {
      // Convert PageStateType to PageStateVO for ExecutionContext
      const pageStateVO = PageStateVO.create({
        url: Url.create(newState.url).getValue(),
        title: newState.title,
        html: '',
        elements: [],
        loadTime: 0
      });
      const contextUpdate = this.context.updatePageState(pageStateVO);
      if (contextUpdate.isFailure()) {
        console.warn('Failed to update context with new state:', contextUpdate.getError());
      }
      
      // Log significant changes
      const urlChanged = previousState.url !== newState.url;
      const sectionsChanged = JSON.stringify(previousState.visibleSections.sort()) !== 
                             JSON.stringify(newState.visibleSections.sort());
      const actionsChanged = JSON.stringify(previousState.availableActions.sort()) !== 
                            JSON.stringify(newState.availableActions.sort());
      
      if (urlChanged) {
        console.log(`🌐 URL changed from ${previousState.url} to ${newState.url}`);
      }
      
      if (sectionsChanged) {
        console.log(`📄 Page sections changed from [${previousState.visibleSections.join(', ')}] to [${newState.visibleSections.join(', ')}]`);
      }
      
      if (actionsChanged) {
        console.log(`⚡ Available actions changed from [${previousState.availableActions.join(', ')}] to [${newState.availableActions.join(', ')}]`);
      }
      
    } catch (error) {
      console.warn('Error recording state change:', error);
    }
  }
}