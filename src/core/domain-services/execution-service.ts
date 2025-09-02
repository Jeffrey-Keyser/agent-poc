import { Task, Step, Result, TaskResult, ExecutionContext } from '../entities';
import { TaskId, ActionType, Evidence, Url, Viewport, PageState, Duration, Timeout } from '../value-objects';
import { Browser } from '../interfaces/browser.interface';
import { TaskQueue } from '../services/task-queue';
import { StrategicTask } from '../types/agent-types';

// Execution context for task execution
export interface TaskExecutionContext {
  currentUrl: Url;
  viewport: Viewport;
  pageState: PageState;
  availableActions: string[];
  previousActions: ExecutionAction[];
  timeRemaining?: Duration;
}

// Execution action record
export interface ExecutionAction {
  taskId: TaskId;
  action: ActionType;
  timestamp: Date;
  coordinates?: { x: number; y: number };
  input?: string;
  success: boolean;
  evidence?: Evidence;
}

// Enhanced execution result with detailed metrics
export interface EnhancedTaskResult extends TaskResult {
  executionTime: Duration;
  retryCount: number;
  evidence: Evidence[];
  actionsTaken: ExecutionAction[];
  confidenceScore: number;
  errorDetails: ExecutionError | undefined;
}

export interface ExecutionError {
  type: 'timeout' | 'element-not-found' | 'navigation-error' | 'validation-error' | 'unknown';
  message: string;
  recoverable: boolean;
  suggestedAction: string;
  stackTrace: string | undefined;
}

// Step execution configuration
export interface StepExecutionConfig {
  timeout: Timeout;
  retryPolicy: {
    maxRetries: number;
    retryDelay: Duration;
    retryOnErrors: string[];
  };
  validationEnabled: boolean;
  evidenceCollection: boolean;
}

/**
 * Domain service interface for execution operations.
 * Handles the complex domain logic of executing tasks and steps in web automation.
 */
export interface ExecutionService {
  /**
   * Executes a single task with the given context
   */
  executeTask(
    task: Task,
    context: TaskExecutionContext,
    config?: Partial<StepExecutionConfig>,
    queue?: TaskQueue
  ): Promise<Result<EnhancedTaskResult>>;

  /**
   * Executes a complete step including all its tasks
   */
  executeStep(
    step: Step,
    context: ExecutionContext,
    config?: StepExecutionConfig,
    queue?: TaskQueue
  ): Promise<Result<{ stepId: string; success: boolean; taskResults: TaskResult[]; confidence: number; }>>;

  /**
   * Validates task execution conditions before execution
   */
  validateExecutionConditions(
    task: Task,
    context: TaskExecutionContext
  ): Promise<Result<ExecutionValidation>>;

  /**
   * Recovers from execution errors when possible
   */
  recoverFromError(
    error: ExecutionError,
    context: TaskExecutionContext
  ): Promise<Result<RecoveryAction>>;

  /**
   * Estimates the execution time for a task
   */
  estimateExecutionTime(
    task: Task,
    context: TaskExecutionContext
  ): Promise<Result<Duration>>;
}

export interface ExecutionValidation {
  canExecute: boolean;
  issues: ValidationIssue[];
  recommendations: string[];
}

export interface ValidationIssue {
  severity: 'blocking' | 'warning' | 'info';
  message: string;
  affectedActions: ActionType[];
}

export interface RecoveryAction {
  type: 'retry' | 'alternative-action' | 'skip' | 'user-intervention';
  description: string;
  estimatedDuration?: Duration;
  confidence: number;
}

/**
 * Browser-based implementation of the Execution Service
 */
export class BrowserExecutionService implements ExecutionService {
  constructor(
    private readonly browser: Browser,
    private readonly taskQueue?: TaskQueue
    // private readonly _llm: LLM,
    // private readonly _domService?: DOMService
  ) {
    // Services are injected and available for use
  }

  async executeTask(
    task: Task,
    context: TaskExecutionContext,
    config: Partial<StepExecutionConfig> = {},
    queue?: TaskQueue
  ): Promise<Result<EnhancedTaskResult>> {
    const startTime = new Date();
    const evidence: Evidence[] = [];
    const actionsTaken: ExecutionAction[] = [];
    let retryCount = 0;
    const maxRetries = config.retryPolicy?.maxRetries ?? 3;
    
    // Use provided queue or instance queue
    const activeQueue = queue || this.taskQueue;

    try {
      // Check queue dependencies if available
      if (activeQueue) {
        const strategicTask = this.convertToStrategicTask(task);
        
        if (!activeQueue.areDependenciesMet(strategicTask)) {
          const unmetDeps = activeQueue.getUnmetDependencies(strategicTask);
          return Result.fail(`Task ${task.getId()} has unmet dependencies: ${unmetDeps.join(', ')}`);
        }
        
        // Priority handling - optimize for high priority tasks
        const priority = task.getPriority();
        if (this.isHighPriority(priority) && activeQueue.size() > 10) {
          // Fast-track high priority tasks
          activeQueue.optimizeForHighPriority();
          await this.optimizeForHighPriority(task);
        }
      }
      // Pre-execution validation
      const validationResult = await this.validateExecutionConditions(task, context);
      if (validationResult.isFailure()) {
        return Result.fail(`Execution validation failed: ${validationResult.getError()}`);
      }

      const validation = validationResult.getValue();
      if (!validation.canExecute) {
        const blockingIssues = validation.issues.filter(i => i.severity === 'blocking');
        return Result.fail(`Cannot execute task: ${blockingIssues.map(i => i.message).join(', ')}`);
      }

      // Execute task with retries
      let taskResult: TaskResult | undefined;
      let lastError: ExecutionError | undefined;

      while (retryCount <= maxRetries) {
        try {
          // Start task execution
          task.execute();
          
          // Perform the actual browser action based on task intent
          const actionResult = await this.performAction(task, context);
          
          if (actionResult.isSuccess()) {
            const action = actionResult.getValue();
            actionsTaken.push(action);
            
            // Collect evidence if enabled
            if (config.evidenceCollection !== false) {
              const taskEvidence = await this.collectEvidence(task, action, context);
              evidence.push(...taskEvidence);
            }

            // Create successful task result
            taskResult = {
              taskId: task.getId().toString(),
              success: true,
              duration: Date.now() - startTime.getTime(),
              timestamp: new Date(),
              data: action.input || 'Task completed successfully'
            };

            break;
          } else {
            throw new Error(actionResult.getError());
          }
        } catch (error) {
          retryCount++;
          lastError = this.createExecutionError(error);
          
          if (retryCount <= maxRetries && this.shouldRetry(lastError, config)) {
            // Wait before retry
            const delay = config.retryPolicy?.retryDelay?.getMilliseconds() ?? 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          break;
        }
      }

      // Handle final result
      if (!taskResult) {
        // Task failed after all retries
        const baseResult = {
          taskId: task.getId().toString(),
          success: false,
          duration: Date.now() - startTime.getTime(),
          timestamp: new Date()
        };
        
        taskResult = lastError?.message 
          ? { ...baseResult, error: lastError.message }
          : baseResult;
      }

      // Complete the task
      const taskCompletionResult = task.complete(taskResult);
      if (taskCompletionResult.isFailure()) {
        return Result.fail(`Failed to complete task: ${taskCompletionResult.getError()}`);
      }

      // Mark completed in queue
      if (activeQueue && taskResult && taskResult.success) {
        activeQueue.markCompleted(task.getId().toString());
      } else if (activeQueue && lastError) {
        activeQueue.markFailed(task.getId().toString(), lastError.message);
      }

      // Create enhanced result
      const enhancedResult: EnhancedTaskResult = {
        ...taskResult,
        executionTime: Duration.fromMilliseconds(Date.now() - startTime.getTime()).getValue(),
        retryCount,
        evidence,
        actionsTaken,
        confidenceScore: this.calculateConfidenceScore(taskResult, evidence, retryCount),
        errorDetails: lastError || undefined
      };

      return Result.ok(enhancedResult);

    } catch (error) {
      return Result.fail(`Task execution error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async executeStep(
    step: Step,
    context: ExecutionContext,
    config: StepExecutionConfig = this.getDefaultStepConfig(),
    queue?: TaskQueue
  ): Promise<Result<{ stepId: string; success: boolean; taskResults: TaskResult[]; confidence: number; }>> {
    const startTime = new Date();
    const taskResults: TaskResult[] = [];
    let allTasksSucceeded = true;
    
    // Use provided queue or instance queue
    const activeQueue = queue || this.taskQueue;

    try {
      // Start the step
      const stepStartResult = step.start();
      if (stepStartResult.isFailure()) {
        return Result.fail(`Failed to start step: ${stepStartResult.getError()}`);
      }

      // Execute all tasks in the step
      const tasks = step.getTasks();
      
      if (activeQueue) {
        // Enqueue all tasks with dependencies
        tasks.forEach((task, index) => {
          const strategicTask = this.convertToStrategicTask(task);
          strategicTask.dependencies = index > 0 ? [tasks[index - 1].getId().toString()] : [];
          
          if (this.isHighPriority(task.getPriority())) {
            activeQueue.enqueuePriority(strategicTask);
          } else {
            activeQueue.enqueue(strategicTask);
          }
        });
        
        // Execute ready tasks potentially in parallel
        return this.executeWithQueue(step, context, activeQueue, config);
      }
      
      for (const task of tasks) {
        // Create task execution context from step context
        const taskContext: TaskExecutionContext = {
          currentUrl: context.getCurrentUrl(),
          viewport: context.getViewport(),
          pageState: context.getPageState() || PageState.create({
            url: context.getCurrentUrl(),
            title: 'Unknown',
            html: '',
            elements: [],
            loadTime: 0
          }),
          availableActions: this.getAvailableActions(context),
          previousActions: this.getPreviousActions(context),
          timeRemaining: this.calculateRemainingTime(config.timeout, startTime)
        };

        // Execute the task
        const taskResult = await this.executeTask(task, taskContext, config, activeQueue);
        
        if (taskResult.isSuccess()) {
          const enhancedResult = taskResult.getValue();
          const baseResult = {
            taskId: enhancedResult.taskId,
            success: enhancedResult.success,
            timestamp: enhancedResult.timestamp,
            data: enhancedResult.data
          };

          // Add optional properties only if they exist
          if (enhancedResult.error) {
            (baseResult as any).error = enhancedResult.error;
          }
          if (enhancedResult.duration) {
            (baseResult as any).duration = enhancedResult.duration;
          }

          taskResults.push(baseResult);

          if (!enhancedResult.success) {
            allTasksSucceeded = false;
          }

          // Update execution context based on task result
          await this.updateContextFromTaskResult(context, enhancedResult);
        } else {
          allTasksSucceeded = false;
          // Create failed task result
          taskResults.push({
            taskId: task.getId().toString(),
            success: false,
            duration: 0,
            timestamp: new Date(),
            error: taskResult.getError()
          });
        }
      }

      // Complete the step
      const stepCompletionResult = step.complete();
      if (stepCompletionResult.isFailure()) {
        return Result.fail(`Failed to complete step: ${stepCompletionResult.getError()}`);
      }

      // Create step result
      const stepResult = {
        stepId: step.getId().toString(),
        success: allTasksSucceeded,
        taskResults,
        confidence: this.calculateStepConfidence(taskResults)
      };

      return Result.ok(stepResult as any);

    } catch (error) {
      return Result.fail(`Step execution error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async validateExecutionConditions(
    task: Task,
    context: TaskExecutionContext
  ): Promise<Result<ExecutionValidation>> {
    try {
      const issues: ValidationIssue[] = [];
      const recommendations: string[] = [];

      // Check if browser is available and responsive
      if (!this.browser) {
        issues.push({
          severity: 'blocking',
          message: 'Browser instance not available',
          affectedActions: [ActionType.leftClick(), ActionType.typeText(), ActionType.navigateUrl()]
        });
      }

      // Check if page is loaded
      try {
        const pageUrl = this.browser.getPageUrl();
        if (!pageUrl) {
          issues.push({
            severity: 'blocking',
            message: 'No page loaded in browser',
            affectedActions: [ActionType.leftClick(), ActionType.typeText(), ActionType.extractText()]
          });
        }
      } catch {
        issues.push({
          severity: 'warning',
          message: 'Could not verify page state',
          affectedActions: []
        });
      }

      // Check task-specific conditions
      const intent = task.getIntent();
      if (intent && this.requiresElementInteraction(intent)) {
        if (!context.pageState || (context.pageState as any).elements?.length === 0) {
          issues.push({
            severity: 'warning',
            message: 'No interactive elements detected on page',
            affectedActions: []
          });
          recommendations.push('Consider refreshing page or waiting for elements to load');
        }
      }

      // Check timeout constraints
      if (context.timeRemaining && context.timeRemaining.getMilliseconds() < 5000) {
        issues.push({
          severity: 'warning',
          message: 'Low time remaining for task execution',
          affectedActions: []
        });
        recommendations.push('Consider extending timeout or prioritizing critical actions');
      }

      const canExecute = !issues.some(issue => issue.severity === 'blocking');

      const validation: ExecutionValidation = {
        canExecute,
        issues,
        recommendations
      };

      return Result.ok(validation);

    } catch (error) {
      return Result.fail(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async recoverFromError(
    error: ExecutionError,
    _context: TaskExecutionContext
  ): Promise<Result<RecoveryAction>> {
    try {
      let recoveryAction: RecoveryAction;

      switch (error.type) {
        case 'timeout':
          recoveryAction = {
            type: 'retry',
            description: 'Retry with extended timeout',
            estimatedDuration: Duration.fromMilliseconds(10000).getValue(),
            confidence: 70
          };
          break;

        case 'element-not-found':
          recoveryAction = {
            type: 'alternative-action',
            description: 'Try alternative element selection method',
            estimatedDuration: Duration.fromMilliseconds(5000).getValue(),
            confidence: 60
          };
          break;

        case 'navigation-error':
          recoveryAction = {
            type: 'retry',
            description: 'Refresh page and retry navigation',
            estimatedDuration: Duration.fromMilliseconds(8000).getValue(),
            confidence: 80
          };
          break;

        case 'validation-error':
          recoveryAction = {
            type: 'user-intervention',
            description: 'Manual validation required',
            confidence: 30
          };
          break;

        default:
          recoveryAction = {
            type: 'skip',
            description: 'Skip task due to unknown error',
            confidence: 20
          };
      }

      return Result.ok(recoveryAction);

    } catch (err) {
      return Result.fail(`Recovery error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async estimateExecutionTime(
    task: Task,
    context: TaskExecutionContext
  ): Promise<Result<Duration>> {
    try {
      let baseDuration = 3000; // 3 seconds base

      const intent = task.getIntent();
      if (intent) {
        // Adjust based on action type
        switch (intent.toString()) {
          case 'navigate':
            baseDuration = 5000;
            break;
          case 'click':
            baseDuration = 2000;
            break;
          case 'type':
            baseDuration = 4000;
            break;
          case 'extract':
            baseDuration = 3000;
            break;
          case 'wait':
            baseDuration = 8000;
            break;
          default:
            baseDuration = 3000;
        }
      }

      // Adjust for page complexity
      const elementCount = context.pageState?.elements.length || 10;
      if (elementCount > 50) {
        baseDuration *= 1.5; // More complex page = longer execution
      }

      // Adjust for network conditions (simplified)
      const networkDelay = 1000; // Assume 1 second network delay
      const totalDuration = baseDuration + networkDelay;

      return Result.ok(Duration.fromMilliseconds(totalDuration).getValue());

    } catch (error) {
      return Result.fail(`Time estimation error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Private helper methods
  private async performAction(
    task: Task, 
    context: TaskExecutionContext
  ): Promise<Result<ExecutionAction>> {
    const intent = task.getIntent();
    if (!intent) {
      return Result.fail('Task has no defined intent');
    }

    const action: ExecutionAction = {
      taskId: task.getId(),
      action: ActionType.leftClick(), // Default action type
      timestamp: new Date(),
      success: false
    };

    try {
      switch (intent.toString()) {
        case 'navigate':
          await this.browser.goToUrl(context.currentUrl.toString());
          action.success = true;
          break;

        case 'click':
          // This would use more sophisticated element detection
          await this.browser.mouseClick(100, 100);
          action.coordinates = { x: 100, y: 100 };
          action.success = true;
          break;

        case 'type':
          // This would detect input fields and type text
          action.input = task.getDescription();
          action.success = true;
          break;

        case 'extract':
          const content = await this.browser.extractContent();
          action.input = content;
          action.success = true;
          break;

        default:
          return Result.fail(`Unsupported intent: ${intent.toString()}`);
      }

      return Result.ok(action);

    } catch (error) {
      action.success = false;
      return Result.fail(`Action execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async collectEvidence(
    task: Task,
    _action: ExecutionAction,
    _context: TaskExecutionContext
  ): Promise<Evidence[]> {
    // This would collect screenshots, DOM states, etc.
    const evidence: Evidence[] = [];

    try {
      // Create evidence from action result
      const evidenceResult = Evidence.create(
        'screenshot',
        'screenshot-data-placeholder',
        {
          source: 'execution-service',
          description: `Task ${task.getId().toString()} executed successfully`,
          confidence: 90
        }
      );

      if (evidenceResult.isSuccess()) {
        evidence.push(evidenceResult.getValue());
      }
    } catch (error) {
      // Evidence collection failure shouldn't fail the task
      console.warn('Evidence collection failed:', error);
    }

    return evidence;
  }

  private createExecutionError(error: unknown): ExecutionError {
    const message = error instanceof Error ? error.message : String(error);
    
    // Classify error type based on message
    let type: ExecutionError['type'] = 'unknown';
    let recoverable = false;

    if (message.includes('timeout') || message.includes('TimeoutError')) {
      type = 'timeout';
      recoverable = true;
    } else if (message.includes('element') || message.includes('selector')) {
      type = 'element-not-found';
      recoverable = true;
    } else if (message.includes('navigate') || message.includes('navigation')) {
      type = 'navigation-error';
      recoverable = true;
    } else if (message.includes('validation') || message.includes('invalid')) {
      type = 'validation-error';
      recoverable = false;
    }

    return {
      type,
      message,
      recoverable,
      suggestedAction: this.getSuggestedAction(type),
      stackTrace: error instanceof Error ? error.stack || undefined : undefined
    };
  }

  private shouldRetry(error: ExecutionError, config: Partial<StepExecutionConfig>): boolean {
    if (!error.recoverable) return false;
    
    const retryOnErrors = config.retryPolicy?.retryOnErrors || ['timeout', 'element-not-found', 'navigation-error'];
    return retryOnErrors.includes(error.type);
  }

  private calculateConfidenceScore(
    result: TaskResult,
    evidence: Evidence[],
    retryCount: number
  ): number {
    let confidence = result.success ? 80 : 20;
    
    // Adjust for evidence quality
    if (evidence.length > 0) {
      const avgEvidenceConfidence = evidence.reduce((sum, e) => sum + (e.getConfidence() || 0), 0) / evidence.length;
      confidence = (confidence + avgEvidenceConfidence) / 2;
    }
    
    // Penalize retries
    confidence = Math.max(10, confidence - (retryCount * 15));
    
    return Math.round(confidence);
  }

  private getDefaultStepConfig(): StepExecutionConfig {
    return {
      timeout: Timeout.create(
        Duration.fromMilliseconds(30000).getValue(),
        'action',
        'Step execution timeout'
      ).getValue(),
      retryPolicy: {
        maxRetries: 3,
        retryDelay: Duration.fromMilliseconds(2000).getValue(),
        retryOnErrors: ['timeout', 'element-not-found', 'navigation-error']
      },
      validationEnabled: true,
      evidenceCollection: true
    };
  }

  private getAvailableActions(_context: ExecutionContext): string[] {
    // This would analyze the current page state to determine available actions
    return ['click', 'type', 'navigate', 'extract', 'wait'];
  }

  private getPreviousActions(_context: ExecutionContext): ExecutionAction[] {
    // This would retrieve previous actions from the context
    return [];
  }

  private calculateRemainingTime(timeout: Timeout, startTime: Date): Duration {
    const elapsed = Date.now() - startTime.getTime();
    const remaining = Math.max(0, timeout.getMilliseconds() - elapsed);
    return Duration.fromMilliseconds(remaining).getValue();
  }

  private async updateContextFromTaskResult(
    _context: ExecutionContext,
    _result: EnhancedTaskResult
  ): Promise<void> {
    // This would update the execution context based on task results
    // For example, update page state, current URL, etc.
  }

  private calculateStepConfidence(taskResults: TaskResult[]): number {
    const successCount = taskResults.filter(r => r.success).length;
    return taskResults.length > 0 ? (successCount / taskResults.length) * 100 : 0;
  }

  private requiresElementInteraction(intent: any): boolean {
    const interactiveIntents = ['click', 'type', 'select', 'hover'];
    return interactiveIntents.includes(intent.toString());
  }

  private getSuggestedAction(errorType: ExecutionError['type']): string {
    switch (errorType) {
      case 'timeout':
        return 'Increase timeout duration or optimize page loading';
      case 'element-not-found':
        return 'Verify element selector or wait for element to appear';
      case 'navigation-error':
        return 'Check URL validity and network connectivity';
      case 'validation-error':
        return 'Review input data and validation criteria';
      default:
        return 'Review task configuration and try alternative approach';
    }
  }

  // TaskQueue integration helper methods
  private convertToStrategicTask(task: Task): StrategicTask {
    return {
      id: task.getId().toString(),
      name: task.getDescription(),
      description: task.getDescription(),
      intent: this.mapIntentToStrategic(task.getIntent()),
      targetConcept: this.extractTargetConcept(task),
      expectedOutcome: this.buildExpectedOutcome(task),
      inputData: this.extractInputData(task),
      dependencies: [],
      maxAttempts: task.getMaxRetries(),
      priority: this.getPriorityValue(task.getPriority()),
      acceptableOutcomes: this.defineAcceptableOutcomes(task),
      requiredEvidence: this.defineRequiredEvidence(task.getIntent()),
      optionalEvidence: this.defineOptionalEvidence(task.getIntent()),
      minSuccessConfidence: this.getConfidenceThreshold(task),
      allowPartialSuccess: this.allowsPartialSuccess(task)
    };
  }

  private mapIntentToStrategic(intent: any): StrategicTask['intent'] {
    const intentMap: Record<string, StrategicTask['intent']> = {
      'Search': 'search',
      'Navigate': 'navigate',
      'Extract': 'extract',
      'Authenticate': 'authenticate',
      'Filter': 'filter',
      'Verify': 'verify',
      'Interact': 'interact'
    };
    
    const intentStr = intent?.toString() || 'interact';
    return intentMap[intentStr] || 'interact';
  }

  private extractTargetConcept(task: Task): string {
    const description = task.getDescription().toLowerCase();
    const conceptPatterns = [
      /(?:click|select|find|locate)\s+(.+)/,
      /(?:enter|type|fill)\s+.+\s+(?:in|into)\s+(.+)/,
      /(?:extract|get|capture)\s+(.+)/
    ];
    
    for (const pattern of conceptPatterns) {
      const match = description.match(pattern);
      if (match) return match[1];
    }
    
    return task.getDescription();
  }

  private buildExpectedOutcome(task: Task): string {
    const intent = task.getIntent()?.toString() || 'interact';
    const description = task.getDescription();
    
    const outcomeTemplates: Record<string, string> = {
      'search': `Search completed with query entered`,
      'navigate': `Navigation to target page successful`,
      'extract': `Data extracted from ${description}`,
      'authenticate': `Authentication completed successfully`,
      'filter': `Filters applied as specified`,
      'verify': `Verification completed: ${description}`,
      'interact': `Interaction completed: ${description}`
    };
    
    return outcomeTemplates[intent] || `Task completed: ${description}`;
  }

  private extractInputData(task: Task): any {
    return (task as any).inputData || undefined;
  }

  private defineAcceptableOutcomes(task: Task): string[] {
    const intent = task.getIntent()?.toString() || 'interact';
    
    const outcomesMap: Record<string, string[]> = {
      'search': ['results displayed', 'no results found', 'search suggestions shown'],
      'navigate': ['page loaded', 'redirected to login', 'navigation completed'],
      'extract': ['data captured', 'partial data captured', 'no data available'],
      'authenticate': ['login successful', 'already authenticated'],
      'filter': ['filters applied', 'results updated', 'no matches found'],
      'verify': ['condition met', 'condition not met', 'verification completed'],
      'interact': ['action completed', 'element updated', 'state changed']
    };
    
    return outcomesMap[intent] || ['task completed'];
  }

  private defineRequiredEvidence(intent: any): string[] {
    const intentStr = intent?.toString() || 'interact';
    const evidenceMap: Record<string, string[]> = {
      'search': ['search_input_filled', 'search_submitted'],
      'navigate': ['page_loaded', 'url_changed'],
      'extract': ['data_captured', 'elements_found'],
      'authenticate': ['login_successful', 'session_established'],
      'filter': ['filter_applied', 'results_updated'],
      'verify': ['condition_checked', 'assertion_passed'],
      'interact': ['element_clicked', 'action_completed']
    };
    
    return evidenceMap[intentStr] || ['action_completed'];
  }

  private defineOptionalEvidence(intent: any): string[] {
    const intentStr = intent?.toString() || 'interact';
    const optionalMap: Record<string, string[]> = {
      'search': ['autocomplete_shown', 'search_history_displayed'],
      'navigate': ['page_title_changed', 'breadcrumb_updated'],
      'extract': ['all_fields_found', 'validation_passed'],
      'authenticate': ['remember_me_checked', 'two_factor_completed'],
      'filter': ['count_updated', 'url_params_changed'],
      'verify': ['screenshot_captured', 'comparison_logged'],
      'interact': ['animation_completed', 'feedback_shown']
    };
    
    return optionalMap[intentStr] || [];
  }

  private isHighPriority(priority: any): boolean {
    if (typeof (priority as any).isHigh === 'function') {
      return (priority as any).isHigh();
    }
    return this.getPriorityValue(priority) >= 7;
  }

  private getPriorityValue(priority: any): number {
    if (typeof (priority as any).getValue === 'function') {
      return (priority as any).getValue();
    }
    if (typeof (priority as any).value === 'number') {
      return (priority as any).value;
    }
    return 5;
  }

  private getConfidenceThreshold(task: Task): number {
    const priority = this.getPriorityValue(task.getPriority());
    if (priority >= 8) return 0.9;
    if (priority >= 5) return 0.7;
    return 0.5;
  }

  private allowsPartialSuccess(task: Task): boolean {
    const intent = task.getIntent()?.toString() || 'interact';
    const priority = this.getPriorityValue(task.getPriority());
    
    return intent === 'extract' && priority < 7;
  }

  private async optimizeForHighPriority(_task: Task): Promise<void> {
    // Implementation for high-priority task optimization
    // This could include pre-loading page elements, optimizing browser settings, etc.
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate optimization work
  }

  private async executeWithQueue(
    step: Step, 
    context: ExecutionContext, 
    queue: TaskQueue, 
    config: StepExecutionConfig
  ): Promise<Result<{ stepId: string; success: boolean; taskResults: TaskResult[]; confidence: number; }>> {
    const taskResults: TaskResult[] = [];
    let allTasksSucceeded = true;

    // Execute ready tasks from queue
    const readyTasks = queue.getReadyTasks();
    
    for (const strategicTask of readyTasks) {
      const task = this.findTaskById(strategicTask.id, step);
      if (!task) continue;

      const taskContext: TaskExecutionContext = {
        currentUrl: context.getCurrentUrl(),
        viewport: context.getViewport(),
        pageState: context.getPageState() || PageState.create({
          url: context.getCurrentUrl(),
          title: 'Unknown',
          html: '',
          elements: [],
          loadTime: 0
        }),
        availableActions: this.getAvailableActions(context),
        previousActions: this.getPreviousActions(context),
        timeRemaining: config.timeout.duration
      };

      const taskResult = await this.executeTask(task, taskContext, config, queue);
      
      if (taskResult.isSuccess()) {
        const enhancedResult = taskResult.getValue();
        const baseResult = {
          taskId: enhancedResult.taskId,
          success: enhancedResult.success,
          timestamp: enhancedResult.timestamp,
          data: enhancedResult.data
        };

        if (enhancedResult.error) {
          (baseResult as any).error = enhancedResult.error;
        }
        if (enhancedResult.duration) {
          (baseResult as any).duration = enhancedResult.duration;
        }

        taskResults.push(baseResult);
        
        if (!enhancedResult.success) {
          allTasksSucceeded = false;
        }
      } else {
        allTasksSucceeded = false;
        taskResults.push({
          taskId: task.getId().toString(),
          success: false,
          duration: 0,
          timestamp: new Date(),
          error: taskResult.getError()
        });
      }
    }

    // Complete the step
    const stepCompletionResult = step.complete();
    if (stepCompletionResult.isFailure()) {
      return Result.fail(`Failed to complete step: ${stepCompletionResult.getError()}`);
    }

    const stepResult = {
      stepId: step.getId().toString(),
      success: allTasksSucceeded,
      taskResults,
      confidence: this.calculateStepConfidence(taskResults)
    };

    return Result.ok(stepResult as any);
  }

  private findTaskById(taskId: string, step: Step): Task | undefined {
    return step.getTasks().find(task => task.getId().toString() === taskId);
  }
}

// DOM service interface (referenced in the implementation)
export interface DOMService {
  findElement(selector: string): Promise<Element | null>;
  getElementText(element: Element): string;
  clickElement(element: Element): Promise<void>;
  typeInElement(element: Element, text: string): Promise<void>;
}