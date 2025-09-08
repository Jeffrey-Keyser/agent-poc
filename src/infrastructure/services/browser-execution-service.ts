import {
  ExecutionService,
  ExecutionAction,
  EnhancedTaskResult,
  StepExecutionConfig,
  ExecutionError,
} from '../../core/domain-services/execution-service';
import { Task, Result, TaskResult } from '../../core/entities';
import { TaskId, ActionType, Evidence, Duration } from '../../core/value-objects';
import { Browser } from '../../core/interfaces/browser.interface';
import { LLM } from '../../core/interfaces/llm.interface';
import { TaskExecutorAgent } from '../../core/agents/task-executor/task-executor';
import { ExecutorConfig, ExecutorInput } from '../../core/types/agent-types';
import { DomService } from '../../infra/services/dom-service';
import { MicroActionData } from '../../core/value-objects/task';

/**
 * Infrastructure implementation of ExecutionService that bridges to the existing TaskExecutorAgent
 * This service acts as an adapter between the domain service interface and the legacy agent implementation
 */
export class BrowserExecutionService implements ExecutionService {
  private taskExecutorAgent: TaskExecutorAgent;

  constructor(
    llm: LLM,
    browser: Browser,
    domService: DomService,
    config: ExecutorConfig
  ) {
    this.taskExecutorAgent = new TaskExecutorAgent(llm, browser, domService, config);
  }

  async executeTask(
    task: Task,
    config: Partial<StepExecutionConfig> = {}
  ): Promise<Result<EnhancedTaskResult>> {
    const startTime = new Date();
    const evidence: Evidence[] = [];
    const actionsTaken: ExecutionAction[] = [];
    let retryCount = 0;
    const maxRetries = config.retryPolicy?.maxRetries ?? 3;

    try {
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
          const executorInput = this.convertTaskToExecutorInput(task);
          
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

  private convertTaskToExecutorInput(task: Task): ExecutorInput {
    return {
      expectedOutcome: task.getDescription()
    }
  }

  private convertMicroActionsToExecutionActions(
    microActions: MicroActionData[], 
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

      // Capture extracted data from finalState
      if (executorOutput.finalState?.extractedData && Object.keys(executorOutput.finalState.extractedData).length > 0) {
        const extractedDataEvidence = Evidence.create(
          'extracted-data',
          JSON.stringify(executorOutput.finalState.extractedData),
          {
            source: 'browser-execution-service',
            description: `Extracted data from task execution: ${Object.keys(executorOutput.finalState.extractedData).join(', ')}`,
            confidence: 95
          }
        );

        if (extractedDataEvidence.isSuccess()) {
          evidence.push(extractedDataEvidence.getValue());
          console.log(`📊 Created evidence for extracted data: ${Object.keys(executorOutput.finalState.extractedData).join(', ')}`);
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