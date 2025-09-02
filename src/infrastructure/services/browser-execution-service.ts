import {
  ExecutionService,
  TaskExecutionContext,
  ExecutionAction,
  EnhancedTaskResult,
  StepExecutionConfig,
  ExecutionValidation,
  RecoveryAction,
  ExecutionError,
  ValidationIssue
} from '../../core/domain-services/execution-service';
import { Task, Step, Result, TaskResult, ExecutionContext } from '../../core/entities';
import { TaskId, ActionType, Evidence, PageState, Duration, Timeout } from '../../core/value-objects';
import { Browser } from '../../core/interfaces/browser.interface';
import { LLM } from '../../core/interfaces/llm.interface';
import { TaskExecutorAgent } from '../../core/agents/task-executor/task-executor';
import { ExecutorConfig, MicroAction } from '../../core/types/agent-types';
import { DomService } from '../../infra/services/dom-service';

/**
 * Infrastructure implementation of ExecutionService that bridges to the existing TaskExecutorAgent
 * This service acts as an adapter between the domain service interface and the legacy agent implementation
 */
export class BrowserExecutionService implements ExecutionService {
  private taskExecutorAgent: TaskExecutorAgent;
  private browser: Browser;

  constructor(
    llm: LLM,
    browser: Browser,
    domService: DomService,
    config: ExecutorConfig
  ) {
    this.taskExecutorAgent = new TaskExecutorAgent(llm, browser, domService, config);
    this.browser = browser;
  }

  async executeTask(
    task: Task,
    context: TaskExecutionContext,
    config: Partial<StepExecutionConfig> = {}
  ): Promise<Result<EnhancedTaskResult>> {
    const startTime = new Date();
    const evidence: Evidence[] = [];
    const actionsTaken: ExecutionAction[] = [];
    let retryCount = 0;
    const maxRetries = config.retryPolicy?.maxRetries ?? 3;

    try {
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
          const taskStartResult = task.execute();
          if (taskStartResult.isFailure()) {
            throw new Error(`Failed to start task: ${taskStartResult.getError()}`);
          }
          
          // Convert task to format expected by TaskExecutorAgent
          const executorInput = this.convertTaskToExecutorInput(task, context);
          
          // Execute using existing TaskExecutorAgent
          const executorOutput = await this.taskExecutorAgent.execute(executorInput);
          
          if (executorOutput && executorOutput.microActions) {
            // Determine success based on results
            const hasResults = executorOutput.results && executorOutput.results.length > 0;
            const success = hasResults || executorOutput.microActions.length > 0;
            
            if (success) {
              // Process successful execution
              const actions = this.convertMicroActionsToExecutionActions(
                executorOutput.microActions,
                task.getId()
              );
              actionsTaken.push(...actions);
              
              // Collect evidence if enabled
              if (config.evidenceCollection !== false) {
                const taskEvidence = await this.collectEvidenceFromExecution(executorOutput);
                evidence.push(...taskEvidence);
              }

              // Create successful task result
              taskResult = {
                taskId: task.getId().toString(),
                success: true,
                duration: Date.now() - startTime.getTime(),
                timestamp: new Date(),
                data: 'Task completed successfully'
              };

              break;
            } else {
              throw new Error('Task execution failed - no results or actions produced');
            }
          } else {
            throw new Error('Task execution failed - no output returned');
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

      if (!taskResult) {
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
    config: StepExecutionConfig = this.getDefaultStepConfig()
  ): Promise<Result<{ stepId: string; success: boolean; taskResults: TaskResult[]; confidence: number; }>> {
    const startTime = new Date();
    const taskResults: TaskResult[] = [];
    let allTasksSucceeded = true;

    try {
      // Start the step
      const stepStartResult = step.start();
      if (stepStartResult.isFailure()) {
        return Result.fail(`Failed to start step: ${stepStartResult.getError()}`);
      }

      // Execute all tasks in the step
      const tasks = step.getTasks();
      
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
        const taskResult = await this.executeTask(task, taskContext, config);
        
        if (taskResult.isSuccess()) {
          const enhancedResult = taskResult.getValue();
          const baseResult: TaskResult = {
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

      return Result.ok(stepResult);

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
        if (!context.pageState || context.pageState.elements?.length === 0) {
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
  private convertTaskToExecutorInput(task: Task, context: TaskExecutionContext): any {
    return {
      strategicTask: {
        id: task.getId().toString(),
        description: task.getDescription(),
        intent: task.getIntent()?.toString() || 'navigate',
        targetConcept: this.extractTargetConcept(task.getDescription()),
        confidence: task.getConfidence?.()?.getValue() || 80
      },
      currentState: {
        url: context.currentUrl.toString(),
        pageContent: context.pageState?.html || '',
        screenshot: undefined,
        domElements: context.pageState?.elements || []
      },
      variables: [], // Would be populated from context if available
      previousActions: context.previousActions?.map(action => ({
        type: action.action.toString(),
        result: action.success ? 'success' : 'failure'
      })) || []
    };
  }

  private convertMicroActionsToExecutionActions(
    microActions: MicroAction[], 
    taskId: TaskId
  ): ExecutionAction[] {
    return microActions.map(action => {
      // Create default evidence
      const evidenceResult = Evidence.create(
        'execution-log',
        JSON.stringify({
          action: action.type,
          selector: action.selector,
          value: action.value,
          description: action.description
        }),
        { source: 'micro-action-execution' }
      );
      
      const executionAction: ExecutionAction = {
        taskId,
        action: this.convertToActionType(action.type),
        timestamp: new Date(),
        success: true // Assume success if action was executed
      };
      
      // Add optional properties only if they have values
      if (action.value?.toString()) {
        executionAction.input = action.value.toString();
      }
      
      if (evidenceResult.isSuccess()) {
        executionAction.evidence = evidenceResult.getValue();
      }
      
      return executionAction;
    });
  }

  private async collectEvidenceFromExecution(executorOutput: any): Promise<Evidence[]> {
    const evidence: Evidence[] = [];

    try {
      // Create evidence from execution output
      if (executorOutput.microActions && executorOutput.microActions.length > 0) {
        const evidenceResult = Evidence.create(
          'execution-log',
          JSON.stringify(executorOutput.microActions),
          {
            source: 'browser-execution-service',
            description: `Executed ${executorOutput.microActions.length} micro-actions`,
            confidence: 90
          }
        );

        if (evidenceResult.isSuccess()) {
          evidence.push(evidenceResult.getValue());
        }
      }

      // Add screenshot evidence if available
      if (executorOutput.screenshot) {
        const screenshotEvidence = Evidence.create(
          'screenshot',
          executorOutput.screenshot,
          {
            source: 'browser-execution-service',
            description: 'Post-execution screenshot',
            confidence: 85
          }
        );

        if (screenshotEvidence.isSuccess()) {
          evidence.push(screenshotEvidence.getValue());
        }
      }
    } catch (error) {
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
    return ['click', 'type', 'navigate', 'extract', 'wait'];
  }

  private getPreviousActions(_context: ExecutionContext): ExecutionAction[] {
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

  private extractTargetConcept(description: string): string {
    // Simple heuristic to extract target concept from description
    const words = description.toLowerCase().split(' ');
    const concepts = words.filter(word => 
      word.length > 3 && 
      !['the', 'and', 'with', 'from', 'that', 'this', 'will'].includes(word)
    );
    return concepts[0] || 'element';
  }

  private convertToActionType(type: string): ActionType {
    switch (type.toLowerCase()) {
      case 'click':
      case 'leftclick':
        return ActionType.leftClick();
      case 'type':
      case 'typetext':
        return ActionType.typeText();
      case 'navigate':
      case 'navigateurl':
        return ActionType.navigateUrl();
      case 'scroll':
        return ActionType.scroll();
      case 'extract':
      case 'extracttext':
        return ActionType.extractText();
      default:
        return ActionType.leftClick();
    }
  }
}