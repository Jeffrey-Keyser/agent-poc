import { Workflow, Plan, Step, Result, WorkflowResult, ExecutionContext } from '../entities';
import { WorkflowId, SessionId, Duration, Confidence, Viewport } from '../value-objects';
import { WorkflowAggregate } from '../aggregates';
import { 
  PlanningService, 
  EvaluationService,
  PlanningContext,
  EvaluationContext,
  StepEvaluation,
} from './';

// Orchestration configuration
export interface OrchestrationConfig {
  maxRetries: number;
  stepTimeout: Duration;
  evaluationEnabled: boolean;
  adaptivePlanning: boolean;
  parallelExecution: boolean;
  errorRecovery: ErrorRecoveryStrategy;
  monitoringEnabled: boolean;
}

export enum ErrorRecoveryStrategy {
  FAIL_FAST = 'fail-fast',
  RETRY_WITH_BACKOFF = 'retry-with-backoff',
  ADAPTIVE_RECOVERY = 'adaptive-recovery',
  SKIP_AND_CONTINUE = 'skip-and-continue'
}

// Orchestration context for maintaining state
export interface OrchestrationContext {
  workflow: Workflow;
  currentPlan?: Plan;
  executionContext: ExecutionContext;
  retryCount: number;
  startTime: Date;
  lastError?: OrchestrationError;
  metrics: OrchestrationMetrics;
}

export interface OrchestrationMetrics {
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  retriedSteps: number;
  totalExecutionTime: number;
  averageStepTime: number;
  successRate: number;
  confidenceScore: number;
}

// Orchestration-specific errors
export interface OrchestrationError {
  type: 'planning' | 'execution' | 'evaluation' | 'timeout' | 'system';
  phase: 'initialization' | 'planning' | 'execution' | 'evaluation' | 'completion';
  message: string;
  cause: Error | undefined;
  recoverable: boolean;
  suggestedAction: string;
  context: Record<string, any>;
}

// Workflow execution phases
export enum ExecutionPhase {
  INITIALIZING = 'initializing',
  PLANNING = 'planning',
  EXECUTING = 'executing',
  EVALUATING = 'evaluating',
  ADAPTING = 'adapting',
  COMPLETING = 'completing',
  FAILED = 'failed'
}

// Real-time execution status
export interface ExecutionStatus {
  phase: ExecutionPhase;
  currentStep: Step | undefined;
  progress: number; // 0-100%
  estimatedTimeRemaining?: Duration;
  metrics: OrchestrationMetrics;
  health: HealthStatus;
  issues: ExecutionIssue[];
}

export interface HealthStatus {
  overall: 'healthy' | 'warning' | 'critical';
  successRate: number;
  responseTime: number;
  errorRate: number;
  recommendations: string[];
}

export interface ExecutionIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'performance' | 'accuracy' | 'reliability' | 'resource';
  description: string;
  impact: string;
  suggestedAction: string;
  autoResolvable: boolean;
}

// Enhanced workflow result with comprehensive details
export interface EnhancedWorkflowResult extends WorkflowResult {
  orchestrationMetrics: OrchestrationMetrics;
  executionPhases: ExecutionPhaseRecord[];
  planEvolution: PlanEvolutionRecord[];
  errorHistory: OrchestrationError[];
  adaptations: AdaptationRecord[];
  finalReport: ExecutionReport;
}

export interface ExecutionPhaseRecord {
  phase: ExecutionPhase;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  success: boolean;
  errors: OrchestrationError[];
}

export interface PlanEvolutionRecord {
  version: number;
  timestamp: Date;
  reason: string;
  changes: PlanChange[];
  confidence: Confidence;
}

export interface PlanChange {
  type: 'added' | 'removed' | 'modified' | 'reordered';
  stepIndex: number;
  description: string;
  impact: 'minor' | 'moderate' | 'significant';
}

export interface AdaptationRecord {
  timestamp: Date;
  trigger: string;
  action: string;
  result: 'successful' | 'failed' | 'partial';
  impact: string;
}

export interface ExecutionReport {
  summary: string;
  goalAchieved: boolean;
  confidence: Confidence;
  keyAchievements: string[];
  challengesEncountered: string[];
  lessonsLearned: string[];
  recommendations: string[];
}

/**
 * Workflow Orchestration Service - Coordinates all domain services to execute workflows
 * This is the primary coordination point for the entire workflow execution process
 */
export class WorkflowOrchestrationService {
  private contexts: Map<WorkflowId, OrchestrationContext> = new Map();

  constructor(
    private readonly planningService: PlanningService,
    // private readonly _executionService: ExecutionService,
    private readonly evaluationService: EvaluationService,
    private readonly errorHandler: ErrorHandlingService,
    private readonly config: OrchestrationConfig = this.getDefaultConfig()
  ) {}

  /**
   * Main orchestration method - coordinates the entire workflow execution
   */
  async orchestrate(workflow: Workflow): Promise<Result<EnhancedWorkflowResult>> {
    const context = this.initializeOrchestrationContext(workflow);
    const workflowId = workflow.getId();

    try {
      this.contexts.set(workflowId, context);
      
      await this.executePhase(context, ExecutionPhase.INITIALIZING, async () => {
        const initResult = await this.initializeWorkflow(workflow);
        if (initResult.isFailure()) {
          throw new Error(`Initialization failed: ${initResult.getError()}`);
        }
      });

      await this.executePhase(context, ExecutionPhase.PLANNING, async () => {
        const plan = await this.createOrRefinePlan(workflow, context);
        if (!plan) {
          throw new Error('Failed to create execution plan');
        }
        context.currentPlan = plan;
        workflow.attachPlan(plan);
      });

      let completedSuccessfully = false;
      
      while (!completedSuccessfully && context.retryCount < this.config.maxRetries) {
        try {
          // Execute steps
          await this.executePhase(context, ExecutionPhase.EXECUTING, async () => {
            const executionResult = await this.executeWorkflowSteps(workflow, context);
            if (executionResult.isFailure()) {
              throw new Error(`Execution failed: ${executionResult.getError()}`);
            }
            completedSuccessfully = executionResult.getValue();
          });

          // Evaluate progress if evaluation is enabled
          if (this.config.evaluationEnabled) {
            await this.executePhase(context, ExecutionPhase.EVALUATING, async () => {
              const evaluationResult = await this.evaluateWorkflowProgress(workflow, context);
              if (evaluationResult.isFailure()) {
                throw new Error(`Evaluation failed: ${evaluationResult.getError()}`);
              }
              
              const evaluation = evaluationResult.getValue();
              if (!evaluation.overallSuccess && this.config.adaptivePlanning) {
                completedSuccessfully = false; // Trigger adaptation
              }
            });
          }

          // Adaptive planning if needed
          if (!completedSuccessfully && this.config.adaptivePlanning) {
            await this.executePhase(context, ExecutionPhase.ADAPTING, async () => {
              const adaptationResult = await this.adaptPlan(workflow, context);
              if (adaptationResult.isFailure()) {
                throw new Error(`Adaptation failed: ${adaptationResult.getError()}`);
              }
            });
          }

        } catch (error) {
          const orchError = this.createOrchestrationError(error, context);
          context.lastError = orchError;

          const recoveryResult = await this.handleError(orchError, context);
          if (recoveryResult.isFailure() || !orchError.recoverable) {
            break; // Exit retry loop
          }

          context.retryCount++;
        }
      }

      const finalResult = await this.executePhase(context, ExecutionPhase.COMPLETING, async () => {
        return this.completeWorkflow(workflow, context, completedSuccessfully);
      });

      return finalResult;

    } catch (error) {
      await this.executePhase(context, ExecutionPhase.FAILED, async () => {
        return this.handleFinalError(error, workflow, context);
      });
      
      return Result.fail(`Workflow orchestration failed: ${error instanceof Error ? error.message : String(error)}`);
      
    } finally {
      this.contexts.delete(workflowId);
    }
  }

  /**
   * Gets real-time execution status for a workflow
   */
  getExecutionStatus(workflowId: WorkflowId): ExecutionStatus | undefined {
    const context = this.contexts.get(workflowId);
    if (!context) return undefined;

    return this.createExecutionStatus(context);
  }

  /**
   * Cancels workflow execution
   */
  async cancelWorkflow(workflowId: WorkflowId): Promise<Result<void>> {
    const context = this.contexts.get(workflowId);
    if (!context) {
      return Result.fail('Workflow not found or not running');
    }

    try {
      const cancelResult = context.workflow.cancel();
    if (cancelResult.isFailure()) {
      return Result.fail(`Cancellation failed: ${cancelResult.getError()}`);
    }
      this.contexts.delete(workflowId);
      return Result.ok();
    } catch (error) {
      return Result.fail(`Cancellation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Pauses workflow execution (if supported)
   */
  async pauseWorkflow(workflowId: WorkflowId): Promise<Result<void>> {
    const context = this.contexts.get(workflowId);
    if (!context) {
      return Result.fail('Workflow not found or not running');
    }

    // Implementation would pause the execution context
    return Result.ok();
  }

  // Private implementation methods
  private initializeOrchestrationContext(workflow: Workflow): OrchestrationContext {
    return {
      workflow,
      executionContext: ExecutionContext.create(
        SessionId.generate(),
        workflow.getId(),
        workflow.startUrl,
        Viewport.create(1024, 768).getValue()
      ).getValue(),
      retryCount: 0,
      startTime: new Date(),
      metrics: {
        totalSteps: 0,
        completedSteps: 0,
        failedSteps: 0,
        retriedSteps: 0,
        totalExecutionTime: 0,
        averageStepTime: 0,
        successRate: 0,
        confidenceScore: 0
      }
    };
  }

  private async executePhase<T>(
    context: OrchestrationContext,
    phase: ExecutionPhase,
    action: () => Promise<T>
  ): Promise<T> {
    const phaseRecord: ExecutionPhaseRecord = {
      phase,
      startTime: new Date(),
      success: false,
      errors: []
    };

    try {
      const result = await action();
      phaseRecord.success = true;
      phaseRecord.endTime = new Date();
      phaseRecord.duration = phaseRecord.endTime.getTime() - phaseRecord.startTime.getTime();
      return result;
    } catch (error) {
      phaseRecord.success = false;
      phaseRecord.endTime = new Date();
      phaseRecord.duration = phaseRecord.endTime.getTime() - phaseRecord.startTime.getTime();
      
      const orchError = this.createOrchestrationError(error, context);
      phaseRecord.errors.push(orchError);
      throw error;
    }
  }

  private async initializeWorkflow(workflow: Workflow): Promise<Result<void>> {
    try {
      const startResult = workflow.start();
      if (startResult.isFailure()) {
        return Result.fail(startResult.getError());
      }
      return Result.ok();
    } catch (error) {
      return Result.fail(`Workflow initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async createOrRefinePlan(
    workflow: Workflow,
    context: OrchestrationContext
  ): Promise<Plan | undefined> {
    try {
      const planningContext: PlanningContext = {
        goal: workflow.goal,
        url: workflow.startUrl.toString(),
        existingPageState: context.executionContext.getPageState()?.title || undefined,
        timeConstraints: this.config.stepTimeout.getMilliseconds()
      };

      const planResult = await this.planningService.createPlan(workflow.goal, planningContext);
      if (planResult.isFailure()) {
        throw new Error(planResult.getError());
      }

      return planResult.getValue();
    } catch (error) {
      console.error('Plan creation failed:', error);
      return undefined;
    }
  }

  private async executeWorkflowSteps(
    workflow: Workflow,
    context: OrchestrationContext
  ): Promise<Result<boolean>> {
    if (!context.currentPlan) {
      return Result.fail('No plan available for execution');
    }

    try {
      const workflowAggregate = new WorkflowAggregate(
        workflow,
        context.currentPlan,
        this.createDefaultSession(workflow)
      );

      let allStepsSucceeded = true;
      const steps = context.currentPlan.getSteps();
      context.metrics.totalSteps = steps.length;

      for (let i = 0; i < steps.length; i++) {
        const stepStartTime = Date.now();
        
        try {
          const stepResult = await workflowAggregate.executeNextStep();
          
          if (stepResult.isSuccess()) {
            const result = stepResult.getValue();
            context.metrics.completedSteps++;
            
            if (!result.success) {
              context.metrics.failedSteps++;
              allStepsSucceeded = false;
            }
          } else {
            context.metrics.failedSteps++;
            allStepsSucceeded = false;
          }

          // Update metrics
          const stepTime = Date.now() - stepStartTime;
          context.metrics.totalExecutionTime += stepTime;
          context.metrics.averageStepTime = context.metrics.totalExecutionTime / (i + 1);

        } catch (error) {
          context.metrics.failedSteps++;
          allStepsSucceeded = false;
          
          if (this.config.errorRecovery === ErrorRecoveryStrategy.FAIL_FAST) {
            throw error;
          }
        }
      }

      // Update success rate
      context.metrics.successRate = context.metrics.totalSteps > 0 ? 
        context.metrics.completedSteps / context.metrics.totalSteps : 0;

      return Result.ok(allStepsSucceeded);

    } catch (error) {
      return Result.fail(`Step execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async evaluateWorkflowProgress(
    workflow: Workflow,
    context: OrchestrationContext
  ): Promise<Result<StepEvaluation>> {
    try {
      if (!context.currentPlan) {
        return Result.fail('No plan available for evaluation');
      }

      const pageState = context.executionContext.getPageState();
      if (!pageState) {
        return Result.fail('No page state available for evaluation');
      }

      const evaluationContext: EvaluationContext = {
        originalGoal: workflow.goal,
        currentUrl: context.executionContext.getCurrentUrl(),
        pageState: pageState,
        expectedOutcome: workflow.goal
      };

      // Get the current step and its results
      const currentStep = context.currentPlan.getCurrentStep();
      if (!currentStep) {
        return Result.fail('No current step to evaluate');
      }

      // This would get actual task results - simplified for now
      const taskResults = currentStep.getTasks().map(task => ({
        taskId: task.getId().toString(),
        success: true,
        duration: 2000,
        timestamp: new Date()
      }));

      const evaluationResult = await this.evaluationService.evaluateStepSuccess(
        currentStep,
        taskResults,
        evaluationContext
      );

      return evaluationResult;

    } catch (error) {
      return Result.fail(`Evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async adaptPlan(
    workflow: Workflow,
    context: OrchestrationContext
  ): Promise<Result<void>> {
    try {
      if (!context.currentPlan || !context.lastError) {
        return Result.ok(); // Nothing to adapt
      }

      // Create feedback from the error
      const feedback = [{
        stepId: context.currentPlan.getCurrentStep()?.getId() || context.currentPlan.getSteps()[0].getId(),
        success: false,
        confidence: Confidence.create(30).getValue(),
        feedback: context.lastError.message,
        suggestedImprovements: [context.lastError.suggestedAction]
      }];

      const refinedPlanResult = await this.planningService.refinePlan(context.currentPlan, feedback);
      if (refinedPlanResult.isFailure()) {
        return Result.fail(`Plan refinement failed: ${refinedPlanResult.getError()}`);
      }

      context.currentPlan = refinedPlanResult.getValue();
      workflow.attachPlan(context.currentPlan);

      return Result.ok();

    } catch (error) {
      return Result.fail(`Plan adaptation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async completeWorkflow(
    workflow: Workflow,
    context: OrchestrationContext,
    success: boolean
  ): Promise<Result<EnhancedWorkflowResult>> {
    try {
      const endTime = new Date();
      const totalDuration = endTime.getTime() - context.startTime.getTime();

      let workflowResult: WorkflowResult;

      if (success) {
        const completionResult = workflow.complete('Workflow completed successfully');
        if (completionResult.isFailure()) {
          return Result.fail(`Workflow completion failed: ${completionResult.getError()}`);
        }

        workflowResult = {
          workflowId: workflow.getId().toString(),
          success: true,
          duration: totalDuration,
          summary: 'Workflow executed successfully'
        };
      } else {
        const failureResult = workflow.fail(context.lastError?.message || 'Workflow execution failed');
        if (failureResult.isFailure()) {
          return Result.fail(`Workflow failure handling failed: ${failureResult.getError()}`);
        }

        workflowResult = {
          workflowId: workflow.getId().toString(),
          success: false,
          duration: totalDuration,
          summary: 'Workflow execution failed'
        };
      }

      // Create enhanced result with orchestration details
      const enhancedResult: EnhancedWorkflowResult = {
        ...workflowResult,
        orchestrationMetrics: context.metrics,
        executionPhases: [], // Would be populated with actual phase records
        planEvolution: [], // Would be populated with plan changes
        errorHistory: context.lastError ? [context.lastError] : [],
        adaptations: [], // Would be populated with adaptation records
        finalReport: this.createExecutionReport(workflow, context, success)
      };

      return Result.ok(enhancedResult);

    } catch (error) {
      return Result.fail(`Workflow completion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleError(
    error: OrchestrationError,
    context: OrchestrationContext
  ): Promise<Result<void>> {
    return this.errorHandler.handleError(error, context);
  }

  private async handleFinalError(
    error: unknown,
    workflow: Workflow,
    context: OrchestrationContext
  ): Promise<Result<EnhancedWorkflowResult>> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    workflow.fail(`Final error: ${errorMessage}`);

    const workflowResult: WorkflowResult = {
      workflowId: workflow.getId().toString(),
      success: false,
      duration: Date.now() - context.startTime.getTime(),
      summary: 'Workflow failed with unrecoverable error'
    };

    const enhancedResult: EnhancedWorkflowResult = {
      ...workflowResult,
      orchestrationMetrics: context.metrics,
      executionPhases: [],
      planEvolution: [],
      errorHistory: context.lastError ? [context.lastError] : [],
      adaptations: [],
      finalReport: this.createExecutionReport(workflow, context, false)
    };

    return Result.ok(enhancedResult);
  }

  private createOrchestrationError(
    error: unknown,
    context: OrchestrationContext
  ): OrchestrationError {
    const message = error instanceof Error ? error.message : String(error);
    
    return {
      type: this.classifyErrorType(message),
      phase: 'execution', // Simplified - would determine actual phase
      message,
      cause: error instanceof Error ? error : undefined,
      recoverable: this.isRecoverable(message),
      suggestedAction: this.getSuggestedAction(message),
      context: {
        workflowId: context.workflow.getId().toString(),
        retryCount: context.retryCount,
        currentStep: context.currentPlan?.getCurrentStep()?.getDescription()
      }
    };
  }

  private classifyErrorType(message: string): OrchestrationError['type'] {
    if (message.includes('plan') || message.includes('planning')) return 'planning';
    if (message.includes('execution') || message.includes('execute')) return 'execution';
    if (message.includes('evaluation') || message.includes('evaluate')) return 'evaluation';
    if (message.includes('timeout')) return 'timeout';
    return 'system';
  }

  private isRecoverable(message: string): boolean {
    const unrecoverablePatterns = ['fatal', 'critical', 'system', 'out of memory'];
    return !unrecoverablePatterns.some(pattern => message.toLowerCase().includes(pattern));
  }

  private getSuggestedAction(message: string): string {
    if (message.includes('timeout')) return 'Increase timeout or optimize execution';
    if (message.includes('plan')) return 'Review and refine execution plan';
    if (message.includes('element')) return 'Verify page state and element selectors';
    return 'Review error details and retry with adjusted parameters';
  }

  private createExecutionStatus(context: OrchestrationContext): ExecutionStatus {
    const progress = context.metrics.totalSteps > 0 ? 
      (context.metrics.completedSteps / context.metrics.totalSteps) * 100 : 0;

    const health: HealthStatus = {
      overall: context.metrics.successRate > 0.8 ? 'healthy' : 
               context.metrics.successRate > 0.5 ? 'warning' : 'critical',
      successRate: context.metrics.successRate,
      responseTime: context.metrics.averageStepTime,
      errorRate: context.metrics.failedSteps / Math.max(1, context.metrics.totalSteps),
      recommendations: this.generateHealthRecommendations(context.metrics)
    };

    return {
      phase: ExecutionPhase.EXECUTING, // Simplified
      currentStep: context.currentPlan?.getCurrentStep() || undefined,
      progress,
      metrics: context.metrics,
      health,
      issues: this.identifyExecutionIssues(context)
    };
  }

  private generateHealthRecommendations(metrics: OrchestrationMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.successRate < 0.7) {
      recommendations.push('Consider reviewing and optimizing the execution plan');
    }
    
    if (metrics.averageStepTime > 10000) {
      recommendations.push('Steps are taking longer than expected - consider performance optimization');
    }
    
    return recommendations;
  }

  private identifyExecutionIssues(context: OrchestrationContext): ExecutionIssue[] {
    const issues: ExecutionIssue[] = [];
    
    if (context.retryCount > 2) {
      issues.push({
        severity: 'high',
        type: 'reliability',
        description: 'Multiple retries indicate reliability issues',
        impact: 'Increased execution time and reduced success rate',
        suggestedAction: 'Review error patterns and improve error handling',
        autoResolvable: false
      });
    }
    
    return issues;
  }

  private createExecutionReport(
    workflow: Workflow,
    context: OrchestrationContext,
    success: boolean
  ): ExecutionReport {
    return {
      summary: success ? 
        `Workflow "${workflow.goal}" completed successfully in ${context.metrics.totalExecutionTime}ms` :
        `Workflow "${workflow.goal}" failed after ${context.retryCount} retries`,
      goalAchieved: success,
      confidence: Confidence.create(success ? 85 : 30).getValue(),
      keyAchievements: success ? [
        `Completed ${context.metrics.completedSteps} out of ${context.metrics.totalSteps} steps`,
        `Achieved ${Math.round(context.metrics.successRate * 100)}% success rate`
      ] : [],
      challengesEncountered: context.lastError ? [context.lastError.message] : [],
      lessonsLearned: [
        `Average step execution time: ${context.metrics.averageStepTime}ms`,
        `Success rate: ${Math.round(context.metrics.successRate * 100)}%`
      ],
      recommendations: this.generateExecutionRecommendations(context, success)
    };
  }

  private generateExecutionRecommendations(
    context: OrchestrationContext,
    success: boolean
  ): string[] {
    const recommendations: string[] = [];
    
    if (!success) {
      recommendations.push('Review error patterns for systematic issues');
      recommendations.push('Consider breaking complex steps into smaller tasks');
    }
    
    if (context.metrics.averageStepTime > 5000) {
      recommendations.push('Optimize step execution for better performance');
    }
    
    return recommendations;
  }

  private createDefaultSession(_workflow: Workflow): any {
    // This would create a default session - simplified implementation
    return {
      getId: () => 'default-session',
      isActive: () => true,
      getMetrics: () => ({})
    };
  }

  private getDefaultConfig(): OrchestrationConfig {
    return {
      maxRetries: 3,
      stepTimeout: Duration.fromMilliseconds(30000).getValue(),
      evaluationEnabled: true,
      adaptivePlanning: true,
      parallelExecution: false,
      errorRecovery: ErrorRecoveryStrategy.RETRY_WITH_BACKOFF,
      monitoringEnabled: true
    };
  }
}

// Error handling service interface
export interface ErrorHandlingService {
  handleError(error: OrchestrationError, context: OrchestrationContext): Promise<Result<void>>;
}