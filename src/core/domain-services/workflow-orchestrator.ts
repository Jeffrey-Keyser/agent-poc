// NEW FILE - Handles all workflow execution flow logic
import { 
  Workflow, Plan, Step, Result, ExecutionContext 
} from '../entities';
import { ExecutionService } from './execution-service';
import { EvaluationService, EvaluationContext } from './evaluation-service';
import { AgentReporter } from '../interfaces/agent-reporter.interface';
import { EnhancedEventBusInterface } from '../interfaces/event-bus.interface';
import { StepResult } from '../types/agent-types';
import { Evidence } from '../value-objects';

export class WorkflowOrchestrator {
  private completedSteps: Map<string, StepResult> = new Map();
  private retryCount: Map<string, number> = new Map();
  
  constructor(
    private executionService: ExecutionService,
    private evaluationService: EvaluationService,
    private eventBus: EnhancedEventBusInterface,
    private reporter: AgentReporter,
    private config: { maxRetries: number; timeout: number }
  ) {}

  /**
   * Execute all steps in a workflow plan
   */
  async executeWorkflow(
    workflow: Workflow,
    plan: Plan,
    context: ExecutionContext
  ): Promise<Result<Map<string, StepResult>>> {
    this.reporter.log(`🚀 Starting workflow execution: ${workflow.goal}`);
    
    const steps = plan.getSteps();
    let consecutiveFailures = 0;
    
    for (const step of steps) {
      try {
        const result = await this.executeStepWithRetry(step, context, workflow);
        
        if (result.isSuccess()) {
          this.completedSteps.set(step.getId().toString(), result.getValue());
          consecutiveFailures = 0;
          this.eventBus.emit('step:completed', { 
            stepId: step.getId().toString(), 
            result: result.getValue() 
          });
        } else {
          consecutiveFailures++;
          
          if (consecutiveFailures >= 3) {
            return Result.fail('Too many consecutive failures');
          }
          
          // Continue with next step (assuming all steps are required for now)
          // Future enhancement: add isRequired() method to Step entity
          this.reporter.log(`⚠️ Step failed: ${step.getDescription()}`);
          
          return Result.fail(`Step failed: ${step.getDescription()}`);
        }
      } catch (error) {
        this.handleStepError(step, error as Error);
        return Result.fail(`Unexpected error in step: ${step.getDescription()}`);
      }
    }
    
    return Result.ok(this.completedSteps);
  }

  /**
   * Execute a single step with retry logic
   */
  private async executeStepWithRetry(
    step: Step,
    context: ExecutionContext,
    workflow: Workflow
  ): Promise<Result<StepResult>> {
    const stepId = step.getId().toString();
    let attempts = this.retryCount.get(stepId) || 0;
    
    while (attempts < this.config.maxRetries) {
      attempts++;
      this.retryCount.set(stepId, attempts);
      
      this.reporter.log(`📋 Executing step (attempt ${attempts}/${this.config.maxRetries}): ${step.getDescription()}`);
      
      // Execute all tasks in the step
      const tasks = step.getTasks();
      const taskResults: StepResult[] = [];
      let stepSuccess = true;
      
      for (const task of tasks) {
        const taskResult = await this.executionService.executeTask(task);
        
        if (taskResult.isSuccess()) {
          const taskData = taskResult.getValue();
          // Convert enhanced task result to step result format
          const stepResult: StepResult = {
            stepId: stepId,
            status: 'success',
            success: true,
            microActions: [], // Would be populated from taskData.actionsTaken
            evidence: {
              extractedData: taskData.evidence || {}
            },
            duration: taskData.executionTime.getMilliseconds(),
            attempts: attempts
          };
          
          // Evaluate task completion
          const evaluationContext: EvaluationContext = {
            originalGoal: workflow.goal,
            currentUrl: context.getCurrentUrl()
          };
          
          // Create evidence array from task execution data
          const evidenceArray: Evidence[] = [];
          if (taskData.evidence && taskData.evidence.length > 0) {
            for (const evidenceItem of taskData.evidence) {
              const evidenceResult = Evidence.create(
                'execution-log',
                JSON.stringify(evidenceItem),
                {
                  source: 'task-executor',
                  description: `Evidence from task: ${task.getDescription()}`,
                  confidence: taskData.confidenceScore
                }
              );
              if (evidenceResult.isSuccess()) {
                evidenceArray.push(evidenceResult.getValue());
              }
            }
          }
          
          const evaluationResult = await this.evaluationService.evaluateTaskCompletion(
            task,
            evidenceArray,
            evaluationContext
          );

          this.reporter.log(`evaluationResult: ${JSON.stringify(evaluationResult)}`);
          
          if (evaluationResult.isSuccess() && evaluationResult.getValue().success) {
            taskResults.push(stepResult);
          } else {
            stepSuccess = false;
            this.reporter.log(`⚠️ Task evaluation failed for: ${task.getDescription()}`);
            break;
          }
        } else {
          stepSuccess = false;
          this.reporter.log(`❌ Task execution failed: ${task.getDescription()}`);
          break;
        }
      }
      
      if (stepSuccess && taskResults.length > 0) {
        // Return the aggregated step result
        const aggregatedResult: StepResult = {
          stepId: stepId,
          status: 'success',
          success: true,
          microActions: taskResults.flatMap(r => r.microActions),
          evidence: {
            extractedData: taskResults.reduce((acc, r) => ({
              ...acc,
              ...r.evidence.extractedData
            }), {})
          },
          duration: taskResults.reduce((sum, r) => sum + r.duration, 0),
          attempts: attempts
        };
        
        return Result.ok(aggregatedResult);
      }
      
      // Wait before retry with exponential backoff
      await this.delay(Math.min(1000 * Math.pow(2, attempts - 1), 10000));
    }
    
    return Result.fail(`Step failed after ${attempts} attempts`);
  }

  /**
   * Handle errors during step execution
   */
  private handleStepError(step: Step, error: Error): void {
    this.reporter.log(`❌ Error in step ${step.getDescription()}: ${error.message}`);
    this.eventBus.emit('step:failed', {
      stepId: step.getId().toString(),
      error: error.message
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get execution progress
   */
  getProgress(): { completed: number; total: number; completedSteps: Map<string, StepResult> } {
    return {
      completed: this.completedSteps.size,
      total: this.retryCount.size,
      completedSteps: this.completedSteps
    };
  }

  /**
   * Reset orchestrator state
   */
  reset(): void {
    this.completedSteps.clear();
    this.retryCount.clear();
  }
}