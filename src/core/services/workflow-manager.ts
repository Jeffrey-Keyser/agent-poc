// SIMPLIFIED WorkflowManager - Now just coordinates between extracted services
import { 
  Workflow, Plan, Result, Session, ExecutionContext
} from '../entities';
import { WorkflowResult } from '../types/agent-types';
import { WorkflowOrchestrator } from '../domain-services/workflow-orchestrator';
import { WorkflowPlanningService } from '../domain-services/workflow-planning-service';
import { WorkflowEventCoordinator } from '../domain-services/workflow-event-coordinator';
import { WorkflowStateCoordinator } from '../domain-services/workflow-state-coordinator';
import { 
  WorkflowRepository, 
  PlanRepository, 
  MemoryRepository 
} from '../repositories';
import { WorkflowAggregate } from '../aggregates/workflow-aggregate';
import { ExecutionAggregate } from '../aggregates/execution-aggregate';
import { SessionId, Url } from '../value-objects';
import { ITaskSummarizer } from '../interfaces/agent.interface';

export interface WorkflowManagerConfig {
  maxRetries?: number;
  timeout?: number;
  enableReplanning?: boolean;
  allowEarlyExit?: boolean;
  minAcceptableCompletion?: number;
}

export class WorkflowManager {
  private executionAggregate: ExecutionAggregate | null = null;
  private workflow: Workflow | null = null;
  private currentPlan: Plan | null = null;
  private startTime: Date | null = null;
  
  constructor(
    private orchestrator: WorkflowOrchestrator,
    private planningService: WorkflowPlanningService,
    private eventCoordinator: WorkflowEventCoordinator,
    private stateCoordinator: WorkflowStateCoordinator,
    private repositories: {
      workflow: WorkflowRepository;
      plan: PlanRepository;
      memory: MemoryRepository;
    },
    private summarizer?: ITaskSummarizer,
    private config: WorkflowManagerConfig = {}
  ) {
    this.config = {
      maxRetries: 3,
      timeout: 300000,
      enableReplanning: true,
      allowEarlyExit: false,
      minAcceptableCompletion: 60,
      ...config
    };
    
    this.setupEventListeners();
  }

  /**
   * Execute a workflow with the given goal
   */
  async execute(goal: string, startUrl?: string): Promise<WorkflowResult> {
    this.startTime = new Date();
    this.eventCoordinator.emitEvent('workflow:started', { goal, startUrl });
    
    try {
      // Initialize workflow and plan
      await this.initializeWorkflow(goal, startUrl);
      
      // Execute the workflow steps
      const executionResult = await this.executeWorkflow();
      
      // Handle completion
      await this.finalizeWorkflow(executionResult);
      
      return this.buildWorkflowResult();
      
    } catch (error) {
      this.handleWorkflowError(error as Error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Initialize workflow with plan
   */
  private async initializeWorkflow(goal: string, startUrl?: string): Promise<void> {
    // Create workflow entity first
    const variables: any[] = [];
    const workflowResult = Workflow.create(goal, startUrl || '', variables);
    if (workflowResult.isFailure()) {
      throw new Error(`Failed to create workflow: ${workflowResult.getError()}`);
    }
    this.workflow = workflowResult.getValue();
    
    // Save workflow to repository
    await this.repositories.workflow.save(this.workflow);
    
    // Initialize state
    await this.stateCoordinator.initializeState(startUrl);
    
    // Create initial plan
    const planResult = await this.planningService.initializePlan(this.workflow, startUrl);
    
    if (planResult.isFailure()) {
      throw new Error(`Failed to create plan: ${planResult.getError()}`);
    }
    
    this.currentPlan = planResult.getValue();
    await this.repositories.plan.save(this.currentPlan);
    
    // Create session for aggregate
    const sessionResult = Session.createDefault(this.workflow.getId());
    if (sessionResult.isFailure()) {
      throw new Error(`Failed to create session: ${sessionResult.getError()}`);
    }
    
    // Create workflow aggregate (for potential future use)
    const workflowAggregateResult = WorkflowAggregate.create(
      this.workflow,
      this.currentPlan,
      sessionResult.getValue()
    );
    if (workflowAggregateResult.isFailure()) {
      throw new Error(`Failed to create workflow aggregate: ${workflowAggregateResult.getError()}`);
    }
    // workflowAggregate stored in local variable only - not needed as instance variable
    
    // Create execution context and aggregate
    const sessionId = SessionId.generate();
    const viewport = { width: 1920, height: 1080 }; // Use simple object instead of Viewport
    const urlResult = startUrl ? Url.create(startUrl) : Url.create('');
    if (!urlResult.isSuccess()) {
      throw new Error(`Failed to create URL: ${urlResult.getError()}`);
    }
    
    const contextResult = ExecutionContext.create(
      sessionId,
      this.workflow.getId(),
      urlResult.getValue(),
      viewport as any
    );
    if (contextResult.isFailure()) {
      throw new Error(`Failed to create execution context: ${contextResult.getError()}`);
    }
    
    // Get state manager from state coordinator
    const stateManager = this.stateCoordinator.getStateManager();
    const executionAggregateResult = ExecutionAggregate.create(contextResult.getValue(), stateManager);
    if (executionAggregateResult.isFailure()) {
      throw new Error(`Failed to create execution aggregate: ${executionAggregateResult.getError()}`);
    }
    this.executionAggregate = executionAggregateResult.getValue();
  }

  /**
   * Execute the workflow using orchestrator
   */
  private async executeWorkflow(): Promise<Result<any>> {
    if (!this.workflow || !this.currentPlan || !this.executionAggregate) {
      return Result.fail('Workflow not properly initialized');
    }
    
    let attemptCount = 0;
    let lastError: string | null = null;
    
    while (attemptCount < 3) {
      attemptCount++;
      
      // Execute with orchestrator
      const context = this.executionAggregate.getContext();
      const result = await this.orchestrator.executeWorkflow(
        this.workflow,
        this.currentPlan,
        context
      );
      
      if (result.isSuccess()) {
        return result;
      }
      
      lastError = result.getError();
      
      // Check if replanning is needed and enabled
      if (this.config.enableReplanning && this.shouldReplan(lastError)) {
        const replanResult = await this.planningService.replanWorkflow(
          this.workflow,
          {
            previousPlan: this.currentPlan,
            failureReason: lastError,
            currentState: this.stateCoordinator.getCurrentContext(),
            attemptNumber: attemptCount
          }
        );
        
        if (replanResult.isSuccess()) {
          this.currentPlan = replanResult.getValue();
          await this.repositories.plan.save(this.currentPlan);
          continue; // Retry with new plan
        }
      }
      
      // Check if we should exit early
      if (this.config.allowEarlyExit && this.hasMinimumCompletion()) {
        return Result.ok(this.orchestrator.getProgress().completedSteps);
      }
      
      break; // Exit if can't replan or recover
    }
    
    return Result.fail(lastError || 'Workflow execution failed');
  }

  /**
   * Finalize workflow execution
   */
  private async finalizeWorkflow(executionResult: Result<any>): Promise<void> {
    if (!this.workflow || !this.currentPlan) return;
    
    const success = executionResult.isSuccess();
    const extractedData = this.stateCoordinator.getExtractedData();
    
    // Update memory with results
    await this.stateCoordinator.updateMemory(
      this.workflow,
      this.currentPlan,
      success,
      extractedData
    );
    
    // Generate summary if available
    if (this.summarizer && success) {
      const summarizerInput = {
        goal: this.workflow.goal,
        plan: this.currentPlan.getSteps().map(step => ({
          id: step.getId().toString(),
          step: step.getOrder(),
          description: step.getDescription(),
          expectedOutcome: step.getDescription()
        })),
        completedSteps: [], // Would be populated from completed steps
        extractedData: extractedData,
        totalDuration: this.getDuration(),
        startTime: this.startTime || new Date(),
        endTime: new Date(),
        errors: [],
        url: ''
      };
      
      const summary = await this.summarizer.execute(summarizerInput);
      this.eventCoordinator.emitEvent('workflow:summary', { summary });
    }
    
    // Emit completion event
    this.eventCoordinator.emitEvent('workflow:completed', {
      workflowId: this.workflow.getId(),
      success,
      extractedData,
      duration: this.getDuration()
    });
  }

  /**
   * Build the workflow result
   */
  private buildWorkflowResult(): WorkflowResult {
    const extractedData = this.stateCoordinator.getExtractedData();
    const progress = this.orchestrator.getProgress();
    
    // Determine status based on progress
    let status: 'success' | 'failure' | 'partial' | 'degraded' = 'failure';
    const completionPercentage = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
    
    if (completionPercentage === 100) {
      status = 'success';
    } else if (completionPercentage >= 70) {
      status = 'partial';
    } else if (completionPercentage >= 40) {
      status = 'degraded';
    }
    
    return {
      id: this.workflow?.getId().toString() || '',
      goal: this.workflow?.goal || '',
      status,
      completedTasks: [], // Would be populated from completed task IDs
      completedSteps: [], // Would be populated from completed steps
      failedTasks: [], // Would be populated from failed tasks
      extractedData,
      summary: `Workflow completed with ${completionPercentage.toFixed(1)}% progress`,
      startTime: this.startTime || new Date(),
      endTime: new Date(),
      duration: this.getDuration()
    };
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.eventCoordinator.setupWorkflowListeners({
      onStepComplete: (step) => this.handleStepComplete(step),
      onError: (error) => this.handleError(error)
    });
    
    this.eventCoordinator.setupStateChangeListeners(
      (state) => this.handleStateChange(state)
    );
  }

  /**
   * Handle step completion
   */
  private handleStepComplete(step: any): void {
    // Could trigger intermediate actions or logging
    console.log(`Step completed: ${step.stepId}`);
  }

  /**
   * Handle errors
   */
  private handleError(error: any): void {
    console.error(`Workflow error: ${error.message}`);
  }

  /**
   * Handle state changes
   */
  private handleStateChange(state: any): void {
    // Could trigger replanning or other responses
    if (state.unexpected) {
      console.warn('Unexpected state change detected');
    }
  }

  /**
   * Check if workflow should replan
   */
  private shouldReplan(error: string): boolean {
    const replanPatterns = [
      'element not found',
      'timeout',
      'unexpected state',
      'navigation failed'
    ];
    
    return replanPatterns.some(pattern => 
      error.toLowerCase().includes(pattern)
    );
  }

  /**
   * Check if minimum completion threshold is met
   */
  private hasMinimumCompletion(): boolean {
    const progress = this.orchestrator.getProgress();
    const completionPercentage = (progress.completed / progress.total) * 100;
    return completionPercentage >= (this.config.minAcceptableCompletion || 60);
  }

  /**
   * Handle workflow error
   */
  private handleWorkflowError(error: Error): void {
    this.eventCoordinator.emitEvent('workflow:failed', {
      workflowId: this.workflow?.getId(),
      error: error.message,
      duration: this.getDuration()
    });
  }

  /**
   * Get execution duration
   */
  private getDuration(): number {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    this.orchestrator.reset();
    this.stateCoordinator.reset();
    this.eventCoordinator.cleanup();
    
    this.executionAggregate = null;
    this.workflow = null;
    this.currentPlan = null;
    this.startTime = null;
  }
}