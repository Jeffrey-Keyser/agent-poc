import { Plan, Step, Task, Result } from '../entities';
import { PlanId, WorkflowId, StepId, Confidence } from '../value-objects';
import { StateManager } from '../services/state-manager';
import { PageState } from '../types/agent-types';
import { LLM } from '../interfaces/llm.interface';
import { MemoryService } from '../services/memory-service';
import { TaskPlannerAgent } from '../agents/task-planner';

export interface StateTransitionAnalysis {
  urlChanged: boolean;
  sectionsChanged: boolean;
  actionsChanged: boolean;
  changeScore: number;
  significantChange: boolean;
}

// Enhanced planning context with state information
export interface PlanningContext {
  goal: string;
  url: string;
  existingPageState: string | undefined;
  previousAttempts?: Plan[];
  workflowId?: WorkflowId; // Fix: Add workflowId to link plans to existing workflows
  currentUrl?: string;
  extractedData?: Record<string, any>;
  checkpoints?: string[];
  stateHistory?: PageState[];
}

// Evaluation feedback for refining plans
export interface EvaluationFeedback {
  stepId: StepId;
  success: boolean;
  confidence: Confidence;
  feedback: string;
  suggestedImprovements?: string[];
  evidenceUrl?: string;
}

// Enhanced result for step decomposition
export interface StepDecompositionResult {
  tasks: Task[];
  estimatedDuration: number;
  confidence: Confidence;
  prerequisites: string[];
}

/**
 * Handles the complex domain logic of creating, refining, and decomposing plans.
 */
export interface PlanningService {
  /**
   * Creates a new plan based on the goal and context
   */
  createPlan(
    goal: string,
    context: PlanningContext,
    stateManager?: StateManager
  ): Promise<Result<Plan>>;

  // FUTURE: Refine plan action

  // FUTURE: Validate plan
}

// Plan validation result
export interface PlanValidationResult {
  isValid: boolean;
  confidence: Confidence;
  issues: ValidationIssue[];
  suggestions: string[];
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  stepIndex: number;
  message: string;
  suggestedFix?: string;
}

// Plan complexity estimate
export interface PlanComplexityEstimate {
  totalSteps: number;
  estimatedDuration: number; // milliseconds
  complexity: 'low' | 'medium' | 'high' | 'very-high';
  confidence: Confidence;
  riskFactors: string[];
}

/**
 * AI-powered implementation of the Planning Service using LLM
 */
export class AITaskPlanningService implements PlanningService {
  private readonly taskPlannerAgent: TaskPlannerAgent;

  constructor(
    private readonly stateManager: StateManager,
    private readonly llm: LLM,
    // @ts-ignore
    private readonly memoryService: MemoryService // TODO: Convert to interface
  ) {
    this.taskPlannerAgent = new TaskPlannerAgent(this.llm);
  }

  async createPlan(
    goal: string,
    context: PlanningContext
  ): Promise<Result<Plan>> {
    try {
      if (!goal?.trim()) {
        return Result.fail('Goal cannot be empty');
      }

      if (!context.url) {
        return Result.fail('URL is required for planning');
      }

      let enhancedContext = {
        ...context,
        currentUrl:  this.stateManager.getCurrentState()?.url || context.url,
        extractedData: this.stateManager.getAllExtractedData() || {},
        checkpoints: this.stateManager.getCheckpointNames(),
        stateHistory: this.stateManager.getStateHistory()
      };

      const planId = PlanId.generate();
      const workflowId = enhancedContext.workflowId || WorkflowId.generate();

      const plan = await this.generatePlanFromGoal(goal, enhancedContext);
      if (!plan.isSuccess()) {
        return Result.fail('Could not generate any steps for the given goal');
      }

      const steps = plan.getValue().getSteps();
      const planResult = Plan.create(planId, workflowId, steps);
      if (planResult.isFailure()) {
        return Result.fail(`Failed to create plan: ${planResult.getError()}`);
      }

      return Result.ok(planResult.getValue());

    } catch (error) {
      return Result.fail(`Planning service error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async generatePlanFromGoal(goal: string, context: PlanningContext): Promise<Result<Plan>>  {
    try {
      // Validate inputs
      if (!goal?.trim()) {
        return Result.fail('Goal cannot be empty');
      }

      if (!context.url) {
        return Result.fail('URL is required for planning');
      }

      // Create planning input compatible with existing TaskPlannerAgent
      const plannerInput = {
        goal: goal,
        currentUrl: context.url,
        constraints: [],
        currentState: {
          url: context.url,
          title: 'Current Page',
          html: context.existingPageState || '',
          elements: [],
          loadTime: Date.now(),
          visibleSections: [],
          availableActions: []
        },
        variables: [],
        previousAttempts: context.previousAttempts?.map(plan => ({
          steps: plan.getSteps().map(step => ({
            description: step.getDescription(),
            confidence: step.getConfidence().getValue()
          }))
        })) || undefined
      };

      // Use existing TaskPlannerAgent to generate strategic plan
      const plannerOutput = await this.taskPlannerAgent.execute(plannerInput);
      if (!plannerOutput || !plannerOutput.strategy) {
        return Result.fail(`Planning failed: No strategy returned`);
      }

      // Convert agent output to domain entities
      const planResult = this.convertAgentOutputToPlan(plannerOutput.strategy, goal, context.workflowId);
      if (planResult.isFailure()) {
        return Result.fail(`Failed to convert plan: ${planResult.getError()}`);
      }

      return Result.ok(planResult.getValue());

    } catch (error) {
      return Result.fail(`Planning service error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private convertAgentOutputToPlan(taskEntities: Task[], _goal: string, workflowId?: WorkflowId): Result<Plan> {
    try {
      const planId = PlanId.generate();
      const planWorkflowId = workflowId || WorkflowId.generate();
      const steps: Step[] = [];

      for (let i = 0; i < taskEntities.length; i++) {
        const task = taskEntities[i];
        
        const stepResult = Step.create(
          StepId.generate(),
          task.getDescription(),
          i + 1,
          Confidence.create(80).getValue()
        );

        if (stepResult.isFailure()) {
          return Result.fail(`Failed to create step ${i}: ${stepResult.getError()}`);
        }

        const step = stepResult.getValue();
        // Add the task to the step
        step.addTask(task);
        steps.push(step);
      }

      const planResult = Plan.create(planId, planWorkflowId, steps);
      if (planResult.isFailure()) {
        return Result.fail(`Failed to create plan: ${planResult.getError()}`);
      }

      return Result.ok(planResult.getValue());
    } catch (error) {
      return Result.fail(`Plan conversion error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
