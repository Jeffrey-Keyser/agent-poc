// Handles all planning and replanning logic
import { 
  Workflow, Plan, Result
} from '../entities';
import { PlanningService } from './planning-service';
// import { MemoryService } from '../services/memory-service'; // Future memory integration
import { StateManager } from '../services/state-manager';
import { AgentReporter } from '../interfaces/agent-reporter.interface';
import { EnhancedEventBusInterface } from '../interfaces/event-bus.interface';

export interface ReplanContext {
  previousPlan: Plan;
  failureReason: string;
  currentState: any;
  attemptNumber: number;
}

export class WorkflowPlanningService {
  private currentPlan: Plan | null = null;
  private planHistory: Plan[] = [];
  
  constructor(
    private planningService: PlanningService,
    private stateManager: StateManager,
    private eventBus: EnhancedEventBusInterface,
    private reporter: AgentReporter
  ) {}

  /**
   * Initialize a plan for the workflow
   */
  async initializePlan(
    workflow: Workflow,
    startUrl?: string
  ): Promise<Result<Plan>> {
    this.reporter.log('📝 Creating initial plan...');
    
    const currentState = this.stateManager.getCurrentState();
    
    const planResult = await this.planningService.createPlan(workflow.goal, {
      goal: workflow.goal,
      url: startUrl || currentState?.url || '',
      previousAttempts: [], // No previous plans for initial planning
      workflowId: workflow.getId()
    });
    
    if (planResult.isSuccess()) {
      this.currentPlan = planResult.getValue();
      this.planHistory.push(this.currentPlan);
      this.eventBus.emit('plan:created' as any, { 
        planId: this.currentPlan.getId().toString(),
        stepCount: this.currentPlan.getSteps().length 
      });
    }
    
    return planResult;
  }

  /**
   * Replan the workflow based on failure context
   */
  async replanWorkflow(
    workflow: Workflow,
    context: ReplanContext
  ): Promise<Result<Plan>> {
    this.reporter.log('🔄 Replanning workflow...');
    
    // Check if replanning is warranted
    if (!this.shouldReplan(context)) {
      return Result.fail('Replanning not warranted');
    }
    
    // Extract lessons from failure
    this.extractLessonsFromFailure(context);
    
    // Create new plan
    const newPlanResult = await this.planningService.createPlan(
      workflow.goal,
      {
        goal: workflow.goal,
        url: context.currentState.url,
        previousAttempts: [], // Pass empty array - lessons learned is not part of standard context
        workflowId: workflow.getId()
      }
    );
    
    if (newPlanResult.isSuccess()) {
      const newPlan = newPlanResult.getValue();
      
      // Validate new plan is sufficiently different
      if (!this.isPlanSufficientlyDifferent(context.previousPlan, newPlan)) {
        return Result.fail('New plan too similar to previous plan');
      }
      
      this.currentPlan = newPlan;
      this.planHistory.push(newPlan);
      this.eventBus.emit('workflow:replanned' as any, {
        oldPlanId: context.previousPlan.getId().toString(),
        newPlanId: newPlan.getId().toString(),
        reason: context.failureReason
      });
      
      return Result.ok(newPlan);
    }
    
    return newPlanResult;
  }

  /**
   * Determine if replanning should occur
   */
  private shouldReplan(context: ReplanContext): boolean {
    // Don't replan after too many attempts
    if (context.attemptNumber >= 3) {
      this.reporter.log('❌ Max replan attempts reached');
      return false;
    }
    
    // Check if failure indicates a fundamental issue
    const fundamentalIssues = [
      'page not found',
      'authentication required',
      'access denied',
      'rate limited'
    ];
    
    if (fundamentalIssues.some(issue => 
      context.failureReason.toLowerCase().includes(issue)
    )) {
      this.reporter.log('❌ Fundamental issue detected, replanning won\'t help');
      return false;
    }
    
    return true;
  }

  /**
   * Extract lessons from failure for improved replanning
   */
  private extractLessonsFromFailure(context: ReplanContext): string[] {
    const lessons: string[] = [];
    
    // Analyze failure patterns
    if (context.failureReason.includes('element not found')) {
      lessons.push('Use more robust element selectors');
      lessons.push('Add wait conditions before interactions');
    }
    
    if (context.failureReason.includes('timeout')) {
      lessons.push('Increase wait times for slow-loading elements');
      lessons.push('Check for loading indicators before proceeding');
    }
    
    if (context.failureReason.includes('unexpected state')) {
      lessons.push('Verify page state before each action');
      lessons.push('Add intermediate validation steps');
    }
    
    return lessons;
  }

  /**
   * Check if new plan is sufficiently different from previous
   */
  private isPlanSufficientlyDifferent(oldPlan: Plan, newPlan: Plan): boolean {
    const oldSteps = oldPlan.getSteps();
    const newSteps = newPlan.getSteps();
    
    // Must have different number of steps or at least 30% different steps
    if (oldSteps.length !== newSteps.length) {
      return true;
    }
    
    let differentSteps = 0;
    for (let i = 0; i < oldSteps.length; i++) {
      if (oldSteps[i].getDescription() !== newSteps[i].getDescription()) {
        differentSteps++;
      }
    }
    
    return (differentSteps / oldSteps.length) >= 0.3;
  }

  /**
   * Get current plan
   */
  getCurrentPlan(): Plan | null {
    return this.currentPlan;
  }

  /**
   * Get plan history
   */
  getPlanHistory(): Plan[] {
    return this.planHistory;
  }
}