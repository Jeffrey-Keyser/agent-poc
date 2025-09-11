import {
  ExecutionService,
  ExecutionAction,
  EnhancedTaskResult,
  StepExecutionConfig,
} from '../../core/domain-services/execution-service';
import { Task, Result, TaskResult } from '../../core/entities';
import { TaskId, ActionType, Evidence, Duration } from '../../core/value-objects';
import { Browser } from '../../core/interfaces/browser.interface';
import { LLM } from '../../core/interfaces/llm.interface';
import { TaskExecutorAgent } from '../../core/agents/task-executor/task-executor';
import { ExecutorConfig } from '../../core/types/agent-types';
import { MicroAction, MicroActionData } from '../../core/value-objects/task';
import { ActionResult } from '../../core/types/agent-types';
import { MicroActionExecutor } from './micro-action-executor';
import { DomService } from '@/infra/services/dom-service';
import { ExecutorInput } from '@/core/types';

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
    private microActionExecutor: MicroActionExecutor,
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
    
    try {
      // Start task execution in domain
      const taskStartResult = task.execute();
      if (taskStartResult.isFailure()) {
        throw new Error(`Failed to start task: ${taskStartResult.getError()}`);
      }
      
      const executorInput = this.convertTaskToExecutorInput(task);
      const decomposition = await this.taskExecutorAgent.execute(executorInput);
      
      if (!decomposition.microActions || decomposition.microActions.length === 0) {
        throw new Error('No micro-actions generated for task');
      }
      
      const executionResults: ActionResult[] = [];
      const extractedData: Record<string, any> = {};
      
      for (const microActionData of decomposition.microActions) {
        try {
          // Create MicroAction value object
          const actionResult = MicroAction.create(microActionData);
          if (!actionResult.isSuccess()) {
            throw new Error(`Invalid micro-action: ${actionResult.getError()}`);
          }
          
          const action = actionResult.getValue();
          
          // Execute the micro-action
          const result = await this.microActionExecutor.execute(action);
          executionResults.push(result);
          
          // Stop on failure
          if (!result.success) {
            console.log(`❌ Micro-action failed: ${action.getDescription()}`);
            break;
          }
          
          // Collect extracted data
          if (action.isExtractionAction() && result.extractedValue !== null) {
            const key = action.getDescription() || `extracted_${Date.now()}`;
            extractedData[key] = result.extractedValue;
            console.log(`📊 Extracted data: ${key}`);
          }
          
          // Add slight delay between actions for stability
          if (action.modifiesPageState()) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
        } catch (error) {
          // Create error result for this micro-action
          executionResults.push({
            action: microActionData,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date(),
            duration: 0
          });
          break;
        }
      }
      
      // Determine overall success
      const allSuccessful = executionResults.length > 0 && 
                           executionResults.every(r => r.success);
      
      // Build task result
      const taskResult: TaskResult = {
        taskId: task.getId().toString(),
        success: allSuccessful,
        duration: Date.now() - startTime.getTime(),
        timestamp: new Date(),
        data: Object.keys(extractedData).length > 0 ? extractedData : undefined
      };
      
      // Complete the task in domain
      const taskCompletionResult = task.complete(taskResult);
      if (taskCompletionResult.isFailure()) {
        return Result.fail(`Failed to complete task: ${taskCompletionResult.getError()}`);
      }
      
      // Collect evidence if enabled
      if (config.evidenceCollection !== false) {
        evidence.push(...this.createExecutionEvidence(
          decomposition.microActions,
          executionResults,
          extractedData
        ));
      }
      
      // Convert results to ExecutionActions
      actionsTaken.push(...this.convertResultsToExecutionActions(
        executionResults,
        task.getId()
      ));
      
      // Create enhanced result
      const enhancedResult: EnhancedTaskResult = {
        ...taskResult,
        executionTime: Duration.fromMilliseconds(Date.now() - startTime.getTime()).getValue(),
        retryCount: 0,
        evidence,
        actionsTaken,
        confidenceScore: this.calculateConfidenceScore(taskResult, evidence, 0),
        errorDetails: undefined
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


  private createExecutionEvidence(
    microActions: MicroActionData[],
    results: ActionResult[],
    extractedData: Record<string, any>
  ): Evidence[] {
    const evidence: Evidence[] = [];
    
    // Evidence for micro-actions
    if (microActions.length > 0) {
      const actionsEvidence = Evidence.create(
        'execution-log',
        JSON.stringify({
          actions: microActions,
          results: results.map(r => ({
            success: r.success,
            error: r.error,
            duration: r.duration
          }))
        }),
        {
          source: 'browser-execution-service',
          description: `Executed ${results.filter(r => r.success).length}/${microActions.length} actions successfully`,
          confidence: 90
        }
      );
      
      if (actionsEvidence.isSuccess()) {
        evidence.push(actionsEvidence.getValue());
      }
    }
    
    // Evidence for extracted data
    if (Object.keys(extractedData).length > 0) {
      const dataEvidence = Evidence.create(
        'extracted-data',
        JSON.stringify(extractedData),
        {
          source: 'browser-execution-service',
          description: `Extracted ${Object.keys(extractedData).length} data fields`,
          confidence: 95
        }
      );
      
      if (dataEvidence.isSuccess()) {
        evidence.push(dataEvidence.getValue());
      }
    }
    
    return evidence;
  }

  private convertResultsToExecutionActions(
    results: ActionResult[],
    taskId: TaskId
  ): ExecutionAction[] {
    return results.map(result => {
      const action = result.action as MicroActionData;
      return {
        taskId,
        action: this.convertToActionType(action.type),
        timestamp: result.timestamp,
        success: result.success,
        input: action.value?.toString()
      };
    });
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