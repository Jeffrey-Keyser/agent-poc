import { Plan, Step, Task, Result } from '../entities';
import { PlanId, WorkflowId, StepId, TaskId, Confidence, Priority, Intent } from '../value-objects';

// Planning context for creating plans
export interface PlanningContext {
  goal: string;
  url: string;
  existingPageState: string | undefined;
  previousAttempts?: Plan[];
  availableActions?: string[];
  userInstructions?: string;
  timeConstraints?: number; // in milliseconds
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
 * Domain service interface for planning operations.
 * Handles the complex domain logic of creating, refining, and decomposing plans.
 */
export interface PlanningService {
  /**
   * Creates a new plan based on the goal and context
   */
  createPlan(
    goal: string,
    context: PlanningContext
  ): Promise<Result<Plan>>;

  /**
   * Refines an existing plan based on evaluation feedback
   */
  refinePlan(
    plan: Plan,
    feedback: EvaluationFeedback[]
  ): Promise<Result<Plan>>;

  /**
   * Decomposes a step into detailed tasks
   */
  decomposeStep(
    step: Step,
    context: PlanningContext
  ): Promise<Result<StepDecompositionResult>>;

  /**
   * Validates a plan for feasibility and completeness
   */
  validatePlan(
    plan: Plan,
    context: PlanningContext
  ): Promise<Result<PlanValidationResult>>;

  /**
   * Estimates the complexity and duration of a plan
   */
  estimatePlanComplexity(
    plan: Plan
  ): Promise<Result<PlanComplexityEstimate>>;
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
  constructor(
    // private readonly _llm: LLM,
    // private readonly _memoryService?: MemoryService
  ) {
    // Services are injected and available for use
  }

  async createPlan(
    goal: string,
    context: PlanningContext
  ): Promise<Result<Plan>> {
    try {
      // Validate inputs
      if (!goal?.trim()) {
        return Result.fail('Goal cannot be empty');
      }

      if (!context.url) {
        return Result.fail('URL is required for planning');
      }

      // Create a new plan with generated ID
      const planId = PlanId.generate();
      const workflowId = WorkflowId.generate();

      // Generate steps using LLM (this would be the actual implementation)
      const steps = await this.generateStepsFromGoal(goal, context);
      
      if (!steps.length) {
        return Result.fail('Could not generate any steps for the given goal');
      }

      const planResult = Plan.create(planId, workflowId, steps);
      if (planResult.isFailure()) {
        return Result.fail(`Failed to create plan: ${planResult.getError()}`);
      }

      return Result.ok(planResult.getValue());

    } catch (error) {
      return Result.fail(`Planning service error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async refinePlan(
    plan: Plan,
    feedback: EvaluationFeedback[]
  ): Promise<Result<Plan>> {
    try {
      if (feedback.length === 0) {
        return Result.ok(plan); // No feedback, return unchanged plan
      }

      // Group feedback by success/failure
      const failedSteps = feedback.filter(f => !f.success);
      // Removed unused variable successfulSteps

      if (failedSteps.length === 0) {
        return Result.ok(plan); // All successful, no refinement needed
      }

      // Create refined steps based on feedback
      const refinedSteps: Step[] = [];
      const existingSteps = plan.getSteps();

      for (let i = 0; i < existingSteps.length; i++) {
        const step = existingSteps[i];
        const stepFeedback = feedback.find(f => f.stepId.equals(step.getId()));

        if (stepFeedback && !stepFeedback.success) {
          // Create improved step based on feedback
          const improvedStep = await this.createImprovedStep(step, stepFeedback);
          if (improvedStep.isSuccess()) {
            refinedSteps.push(improvedStep.getValue());
          } else {
            refinedSteps.push(step); // Keep original if improvement fails
          }
        } else {
          refinedSteps.push(step); // Keep successful steps unchanged
        }
      }

      // Create new plan with refined steps
      const refinedPlanResult = Plan.create(
        PlanId.generate(),
        plan.getWorkflowId(),
        refinedSteps
      );

      if (refinedPlanResult.isFailure()) {
        return Result.fail(`Failed to create refined plan: ${refinedPlanResult.getError()}`);
      }

      return Result.ok(refinedPlanResult.getValue());

    } catch (error) {
      return Result.fail(`Plan refinement error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async decomposeStep(
    step: Step,
    context: PlanningContext
  ): Promise<Result<StepDecompositionResult>> {
    try {
      // Generate detailed tasks for this step
      const tasks = await this.generateTasksForStep(step, context);
      
      if (tasks.length === 0) {
        return Result.fail(`Could not decompose step: ${step.getDescription()}`);
      }

      // Calculate estimates
      const estimatedDuration = tasks.reduce((total, task) => {
        // Simple heuristic: each task takes 2-5 seconds based on complexity
        return total + this.estimateTaskDuration(task);
      }, 0);

      // Calculate overall confidence
      const confidenceScores = tasks.map(task => task.getConfidence?.() || Confidence.create(75).getValue());
      const avgConfidence = this.calculateAverageConfidence(confidenceScores);

      // Identify prerequisites
      const prerequisites = this.identifyPrerequisites(tasks);

      const result: StepDecompositionResult = {
        tasks,
        estimatedDuration,
        confidence: avgConfidence,
        prerequisites
      };

      return Result.ok(result);

    } catch (error) {
      return Result.fail(`Step decomposition error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async validatePlan(
    plan: Plan,
    _context: PlanningContext
  ): Promise<Result<PlanValidationResult>> {
    try {
      const issues: ValidationIssue[] = [];
      const steps = plan.getSteps();

      // Validate each step
      steps.forEach((step, index) => {
        // Check if step description is meaningful
        if (!step.getDescription() || step.getDescription().length < 10) {
          issues.push({
            severity: 'error',
            stepIndex: index,
            message: 'Step description is too brief or missing',
            suggestedFix: 'Provide a more detailed description of what this step accomplishes'
          });
        }

        // Check confidence levels
        if (step.getConfidence().isLow()) {
          issues.push({
            severity: 'warning',
            stepIndex: index,
            message: 'Step has low confidence score',
            suggestedFix: 'Consider breaking this step into smaller, more specific tasks'
          });
        }
      });

      // Check overall plan structure
      if (steps.length === 0) {
        issues.push({
          severity: 'error',
          stepIndex: -1,
          message: 'Plan contains no steps',
          suggestedFix: 'Add steps to accomplish the goal'
        });
      }

      if (steps.length > 20) {
        issues.push({
          severity: 'warning',
          stepIndex: -1,
          message: 'Plan has too many steps and may be overly complex',
          suggestedFix: 'Consider combining related steps or breaking into sub-workflows'
        });
      }

      const hasErrors = issues.some(issue => issue.severity === 'error');
      const confidence = hasErrors ? 
        Confidence.create(30).getValue() : 
        issues.length > 0 ? Confidence.create(70).getValue() : Confidence.create(95).getValue();

      const suggestions = this.generatePlanSuggestions(plan, issues);

      const validationResult: PlanValidationResult = {
        isValid: !hasErrors,
        confidence,
        issues,
        suggestions
      };

      return Result.ok(validationResult);

    } catch (error) {
      return Result.fail(`Plan validation error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async estimatePlanComplexity(
    plan: Plan
  ): Promise<Result<PlanComplexityEstimate>> {
    try {
      const steps = plan.getSteps();
      const totalSteps = steps.length;

      // Estimate duration based on step count and confidence
      let estimatedDuration = 0;
      let complexityScore = 0;
      const riskFactors: string[] = [];

      steps.forEach(step => {
        const stepDuration = this.estimateStepDuration(step);
        estimatedDuration += stepDuration;

        if (step.getConfidence().isLow()) {
          complexityScore += 3;
          riskFactors.push(`Step "${step.getDescription()}" has low confidence`);
        } else if (step.getConfidence().isMedium()) {
          complexityScore += 2;
        } else {
          complexityScore += 1;
        }
      });

      // Determine complexity level
      let complexity: PlanComplexityEstimate['complexity'];
      if (complexityScore <= 5) complexity = 'low';
      else if (complexityScore <= 15) complexity = 'medium';
      else if (complexityScore <= 30) complexity = 'high';
      else complexity = 'very-high';

      // Additional risk factors
      if (totalSteps > 15) {
        riskFactors.push('Plan has many steps which increases failure risk');
      }

      if (estimatedDuration > 60000) { // > 1 minute
        riskFactors.push('Plan has long estimated duration');
      }

      const confidence = Confidence.create(
        Math.max(20, 100 - (complexityScore * 2))
      ).getValue();

      const estimate: PlanComplexityEstimate = {
        totalSteps,
        estimatedDuration,
        complexity,
        confidence,
        riskFactors
      };

      return Result.ok(estimate);

    } catch (error) {
      return Result.fail(`Complexity estimation error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Private helper methods
  private async generateStepsFromGoal(goal: string, context: PlanningContext): Promise<Step[]> {
    // This would use the LLM to generate steps
    // For now, return a simple example
    const step1 = Step.create(
      StepId.generate(),
      `Navigate to ${context.url}`,
      0,
      Confidence.create(90).getValue()
    );

    const step2 = Step.create(
      StepId.generate(),
      `Accomplish goal: ${goal}`,
      1,
      Confidence.create(75).getValue()
    );

    const steps: Step[] = [];
    if (step1.isSuccess()) steps.push(step1.getValue());
    if (step2.isSuccess()) steps.push(step2.getValue());

    return steps;
  }

  private async createImprovedStep(step: Step, feedback: EvaluationFeedback): Promise<Result<Step>> {
    // Create improved version based on feedback
    const improvedDescription = `${step.getDescription()} (Improved: ${feedback.feedback})`;
    const improvedConfidence = Confidence.create(
      Math.min(100, step.getConfidence().getValue() + 10)
    ).getValue();

    return Step.create(
      StepId.generate(),
      improvedDescription,
      step.getOrder(),
      improvedConfidence
    );
  }

  private async generateTasksForStep(step: Step, _context: PlanningContext): Promise<Task[]> {
    // This would use LLM to generate specific tasks
    // For now, return a simple task  
    const intentResult = Intent.create('navigate');
    if (!intentResult.isSuccess()) {
      return [];
    }

    const taskResult = Task.create(
      TaskId.generate(),
      intentResult.getValue(),
      step.getDescription(),
      Priority.medium()
    );

    return taskResult.isSuccess() ? [taskResult.getValue()] : [];
  }

  private estimateTaskDuration(task: Task): number {
    // Simple heuristic based on task description and priority
    const baseDuration = 3000; // 3 seconds
    const priorityMultiplier = task.getPriority().isHigh() ? 1.5 : 
                              task.getPriority().isMedium() ? 1.2 : 1.0;
    return baseDuration * priorityMultiplier;
  }

  private estimateStepDuration(step: Step): number {
    // Base duration with confidence adjustment
    const baseDuration = 5000; // 5 seconds per step
    const confidenceMultiplier = step.getConfidence().isLow() ? 2.0 :
                                step.getConfidence().isMedium() ? 1.5 : 1.0;
    return baseDuration * confidenceMultiplier;
  }

  private calculateAverageConfidence(confidences: Confidence[]): Confidence {
    if (confidences.length === 0) return Confidence.create(50).getValue();
    
    const average = confidences.reduce((sum, conf) => sum + conf.getValue(), 0) / confidences.length;
    return Confidence.create(Math.round(average)).getValue();
  }

  private identifyPrerequisites(tasks: Task[]): string[] {
    // Simple heuristic for identifying prerequisites
    const prerequisites: string[] = [];
    
    tasks.forEach(task => {
      const description = task.getDescription().toLowerCase();
      if (description.includes('login') || description.includes('authenticate')) {
        prerequisites.push('User authentication required');
      }
      if (description.includes('form') || description.includes('input')) {
        prerequisites.push('Form elements must be visible and accessible');
      }
    });

    return [...new Set(prerequisites)]; // Remove duplicates
  }

  private generatePlanSuggestions(plan: Plan, issues: ValidationIssue[]): string[] {
    const suggestions: string[] = [];

    if (issues.some(i => i.message.includes('low confidence'))) {
      suggestions.push('Consider adding more specific steps to increase confidence');
    }

    if (plan.getSteps().length > 10) {
      suggestions.push('Large plans can be broken into smaller sub-workflows for better maintainability');
    }

    if (issues.length === 0) {
      suggestions.push('Plan looks well-structured and ready for execution');
    }

    return suggestions;
  }
}

// Memory service interface (referenced in the implementation)
export interface MemoryService {
  savePattern(pattern: LearnedPattern): Promise<void>;
  findSimilarPatterns(context: string): Promise<LearnedPattern[]>;
  updatePatternSuccess(patternId: string, success: boolean): Promise<void>;
}

export interface LearnedPattern {
  id: string;
  context: string;
  pattern: string;
  successRate: number;
  usageCount: number;
}