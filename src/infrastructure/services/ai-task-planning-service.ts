import { 
  PlanningService, 
  PlanningContext, 
  EvaluationFeedback, 
  StepDecompositionResult,
  PlanValidationResult,
  PlanComplexityEstimate
} from '../../core/domain-services/planning-service';
import { Plan, Step, Task, Result } from '../../core/entities';
import { PlanId, WorkflowId, StepId, TaskId, Confidence, Priority, Intent } from '../../core/value-objects';
import { LLM } from '../../core/interfaces/llm.interface';
import { TaskPlannerAgent } from '../../core/agents/task-planner/task-planner';
import { PlannerConfig, StrategicTask } from '../../core/types/agent-types';

/**
 * Infrastructure implementation of PlanningService that bridges to the existing TaskPlannerAgent
 * This service acts as an adapter between the domain service interface and the legacy agent implementation
 */
export class AITaskPlanningService implements PlanningService {
  private taskPlannerAgent: TaskPlannerAgent;

  constructor(
    llm: LLM,
    config: PlannerConfig
  ) {
    this.taskPlannerAgent = new TaskPlannerAgent(llm, config);
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
      // Generate detailed tasks for this step using the same LLM approach
      const tasks = await this.generateTasksForStep(step, context);
      
      if (tasks.length === 0) {
        return Result.fail(`Could not decompose step: ${step.getDescription()}`);
      }

      // Calculate estimates
      const estimatedDuration = tasks.reduce((total, task) => {
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
      const issues: any[] = [];
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
  private convertAgentOutputToPlan(strategicSteps: StrategicTask[], _goal: string, workflowId?: WorkflowId): Result<Plan> {
    try {
      const planId = PlanId.generate();
      // Fix: Use provided workflowId or generate new one as fallback
      const planWorkflowId = workflowId || WorkflowId.generate();
      const steps: Step[] = [];

      for (let i = 0; i < strategicSteps.length; i++) {
        const strategicStep = strategicSteps[i];
        
        const stepResult = Step.create(
          StepId.generate(),
          strategicStep.description,
          i + 1, // Fix: Use 1-based indexing (step order must be positive)
          Confidence.create(80).getValue() // Use default confidence
        );

        if (stepResult.isFailure()) {
          return Result.fail(`Failed to create step ${i}: ${stepResult.getError()}`);
        }

        const step = stepResult.getValue();
        
        // Convert strategic task to Task entity and add to step
        const taskResult = this.convertStrategicTaskToTaskEntity(strategicStep);
        if (taskResult.isFailure()) {
          return Result.fail(`Failed to convert strategic task to task entity: ${taskResult.getError()}`);
        }
        
        const addTaskResult = step.addTask(taskResult.getValue());
        if (addTaskResult.isFailure()) {
          return Result.fail(`Failed to add task to step: ${addTaskResult.getError()}`);
        }

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

  private async createImprovedStep(step: Step, feedback: EvaluationFeedback): Promise<Result<Step>> {
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

  private async generateTasksForStep(step: Step, _context: PlanningContext): Promise<any[]> {
    // This would use the LLM to generate specific tasks based on step description
    // For now, creating a simple task representation
    const intentResult = Intent.create('navigate');
    if (!intentResult.isSuccess()) {
      return [];
    }

    // This is a simplified implementation - in reality would use LLM to decompose
    return [{
      getId: () => TaskId.generate(),
      getIntent: () => intentResult.getValue(),
      getDescription: () => step.getDescription(),
      getPriority: () => Priority.medium(),
      getConfidence: () => step.getConfidence()
    }];
  }

  private estimateTaskDuration(task: any): number {
    const baseDuration = 3000; // 3 seconds
    const priorityMultiplier = task.getPriority?.()?.isHigh?.() ? 1.5 : 
                              task.getPriority?.()?.isMedium?.() ? 1.2 : 1.0;
    return baseDuration * priorityMultiplier;
  }

  private estimateStepDuration(step: Step): number {
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

  private identifyPrerequisites(tasks: any[]): string[] {
    const prerequisites: string[] = [];
    
    tasks.forEach(task => {
      const description = task.getDescription?.()?.toLowerCase() || '';
      if (description.includes('login') || description.includes('authenticate')) {
        prerequisites.push('User authentication required');
      }
      if (description.includes('form') || description.includes('input')) {
        prerequisites.push('Form elements must be visible and accessible');
      }
    });

    return [...new Set(prerequisites)]; // Remove duplicates
  }

  private generatePlanSuggestions(plan: Plan, issues: any[]): string[] {
    const suggestions: string[] = [];

    if (issues.some((i: any) => i.message.includes('low confidence'))) {
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

  // Task conversion methods - adapted from workflow-manager.ts
  private convertStrategicTaskToTaskEntity(strategicTask: StrategicTask): Result<Task> {
    const taskId = TaskId.generate();
    
    // Map strategic intent to Task entity intent
    const mappedIntent = this.mapStrategicIntentToTaskIntent(strategicTask.intent);
    
    // Create Intent value object with mapped intent
    const intent = Intent.create(mappedIntent);
    if (!intent.isSuccess()) {
      return Result.fail(`Invalid intent: ${intent.getError()}`);
    }
    
    // Create Priority value object based on strategic task priority
    const priority = strategicTask.priority <= 2 ? Priority.high() : 
                    strategicTask.priority <= 4 ? Priority.medium() : 
                    Priority.low();
    
    // Create Task entity
    return Task.create(
      taskId,
      intent.getValue(),
      strategicTask.description,
      priority,
      strategicTask.maxAttempts || 3,
      30000 // 30 second timeout
    );
  }

  // Map strategic intent to Task entity intent
  private mapStrategicIntentToTaskIntent(strategicIntent: string): string {
    // Map strategic-level intents to browser-action intents
    const intentMapping: Record<string, string> = {
      'search': 'type',        // Searching involves typing in a search box
      'filter': 'click',       // Filtering involves clicking filter options
      'interact': 'click',     // General interaction is usually clicking
      'authenticate': 'fill',  // Authentication involves filling forms
      'navigate': 'navigate',  // Direct mapping
      'extract': 'extract',    // Direct mapping
      'verify': 'verify'       // Direct mapping
    };
    
    const normalized = strategicIntent.toLowerCase().trim();
    return intentMapping[normalized] || 'click'; // Default to 'click' for unknown intents
  }
}