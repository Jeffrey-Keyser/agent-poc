import { Result } from '../entities/result';
import { Workflow } from '../entities/workflow';
import { Plan } from '../entities/plan';
import { Session } from '../entities/session';
import { Step } from '../entities/step';
import { Task } from '../entities/task';
import { TaskResult } from '../entities/status-types';
import { DomainEvent } from '../domain-events';

// Value object for step execution results
export class StepExecutionResult {
  constructor(
    public readonly step: Step,
    public readonly taskResults: ReadonlyArray<TaskResult>,
    public readonly success: boolean,
    public readonly completedAt: Date = new Date()
  ) {}

  getTaskCount(): number {
    return this.taskResults.length;
  }

  getSuccessfulTasks(): number {
    return this.taskResults.filter(result => result.success).length;
  }

  getFailedTasks(): number {
    return this.taskResults.filter(result => !result.success).length;
  }

  getSuccessRate(): number {
    if (this.taskResults.length === 0) return 0;
    return this.getSuccessfulTasks() / this.taskResults.length;
  }
}

// Workflow Aggregate - coordinates the entire workflow execution process
export class WorkflowAggregate {
  private readonly domainEvents: DomainEvent[] = [];

  constructor(
    private readonly workflow: Workflow,
    private readonly plan: Plan,
    private readonly session: Session
  ) {
    this.validateAggregateConsistency();
  }

  static create(
    workflow: Workflow,
    plan: Plan,
    session: Session,
  ): Result<WorkflowAggregate> {
    if (!plan.getWorkflowId().equals(workflow.getId())) {
      return Result.fail('Plan does not belong to the workflow');
    }

    if (!session.getWorkflowId().equals(workflow.getId())) {
      return Result.fail('Session does not belong to the workflow');
    }

    if (workflow.isComplete() || workflow.isFailed()) {
      return Result.fail('Cannot create aggregate for completed or failed workflow');
    }

    return Result.ok(new WorkflowAggregate(workflow, plan, session));
  }

  getWorkflow(): Workflow {
    return this.workflow;
  }

  getPlan(): Plan {
    return this.plan;
  }

  getSession(): Session {
    return this.session;
  }

  async executeNextStep(): Promise<Result<StepExecutionResult>> {
    const currentStep = this.plan.getCurrentStep();
    if (!currentStep) {
      return Result.fail('No current step available');
    }
    
    const stepStartResult = currentStep.start();
    if (stepStartResult.isFailure()) {
      return Result.fail(`Failed to start step: ${stepStartResult.getError()}`);
    }
    
    const stepExecutionResult = new StepExecutionResult(
      currentStep,
      [], // Empty results - will be filled by WorkflowManager
      false // Not complete yet
    );
    
    return Result.ok(stepExecutionResult);
  }

  startExecution(): Result<void> {
    const workflowStartResult = this.workflow.start();
    if (workflowStartResult.isFailure()) {
      return Result.fail(workflowStartResult.getError());
    }

    if (!this.workflow.getPlan()) {
      const planAttachResult = this.workflow.attachPlan(this.plan);
      if (planAttachResult.isFailure()) {
        return Result.fail(planAttachResult.getError());
      }
    }

    if (!this.session.isActive()) {
      return Result.fail('Session is not active');
    }

    this.validateInvariants();
    return Result.ok();
  }

  completeExecution(summary: string, extractedData?: any): Result<void> {
    const completionResult = this.workflow.complete(summary, extractedData);
    if (completionResult.isFailure()) {
      return Result.fail(completionResult.getError());
    }

    const sessionEndResult = this.session.end();
    if (sessionEndResult.isFailure()) {
      return Result.fail(`Failed to end session: ${sessionEndResult.getError()}`);
    }

    this.validateInvariants();
    return Result.ok();
  }

  // Fail the workflow execution
  failExecution(reason: string): Result<void> {
    const failResult = this.workflow.fail(reason);
    if (failResult.isFailure()) {
      return Result.fail(failResult.getError());
    }

    this.session.markError(
      new Error(reason),
      'Workflow execution failure',
      false
    );

    this.validateInvariants();
    return Result.ok();
  }

  // Get current execution status
  getExecutionStatus(): {
    workflowStatus: string;
    sessionStatus: string;
    currentStepIndex: number;
    totalSteps: number;
    completionPercentage: number;
    isHealthy: boolean;
  } {
    return {
      workflowStatus: this.workflow.getStatus(),
      sessionStatus: this.session.getStatus(),
      currentStepIndex: this.plan.getCurrentStepIndex(),
      totalSteps: this.plan.getSteps().length,
      completionPercentage: this.plan.getProgress() * 100,
      isHealthy: this.session.isHealthy()
    };
  }

  // Get next step without executing
  getNextStep(): Result<Step> {
    const currentStep = this.plan.getCurrentStep();
    if (!currentStep) {
      return Result.fail('No current step available');
    }
    
    // If current step is failed and can't be retried, try to advance to next step
    if (currentStep.isFailed() && !currentStep.canRetry()) {
      const advanceResult = this.plan.advance();
      if (advanceResult.isFailure()) {
        return Result.fail(`Cannot advance from failed step: ${advanceResult.getError()}`);
      }
      
      // Get the new current step after advancing
      const nextStep = this.plan.getCurrentStep();
      if (!nextStep) {
        return Result.fail('No more steps available after advancing from failed step');
      }
      
      return Result.ok(nextStep);
    }
    
    // Return current step (could be pending, running, or failed but retryable)
    return Result.ok(currentStep);
  }

  // Complete a step with external results
  completeStep(stepId: any, results: TaskResult[]): Result<void> {
    const currentStep = this.plan.getCurrentStep();
    if (!currentStep || !currentStep.getId().equals(stepId)) {
      return Result.fail('Step ID does not match current step');
    }
    
    // Update tasks with results
    for (const result of results) {
      const task = this.findTaskById(result.taskId);
      if (task) {
        if (result.success) {
          task.complete(result);
        } else {
          task.fail(new Error(result.error || 'Task failed'));
        }
      }
    }
    
    // Determine if step succeeded or failed
    const stepSuccess = results.every(r => r.success);
    
    if (stepSuccess) {
      // Step succeeded - complete it
      const completeResult = currentStep.complete();
      if (completeResult.isFailure()) {
        return Result.fail(`Failed to complete step: ${completeResult.getError()}`);
      }
      
      // Advance plan if successful and plan not complete
      if (!this.plan.isComplete()) {
        const advanceResult = this.plan.advance();
        if (advanceResult.isFailure()) {
          return Result.fail(`Failed to advance plan: ${advanceResult.getError()}`);
        }
      }
    } else {
      // Step failed - mark it as failed
      const failResult = currentStep.fail('Tasks in step failed');
      if (failResult.isFailure()) {
        return Result.fail(`Failed to mark step as failed: ${failResult.getError()}`);
      }
      
      // Check if step can be retried
      if (currentStep.canRetry()) {
        const retryResult = currentStep.retry();
        if (retryResult.isSuccess()) {
          // Step has been reset to Pending for retry
          return Result.ok();
        }
      }
      // If step can't be retried or retry failed, the step remains in Failed state
      // The workflow manager should handle this by either advancing or stopping
    }
    
    this.validateInvariants();
    return Result.ok();
  }

  // Record task completion from external execution
  recordTaskCompletion(taskId: any, result: TaskResult): Result<void> {
    const task = this.findTaskByIdInPlan(taskId);
    if (!task) {
      return Result.fail('Task not found in plan');
    }
    
    this.workflow.recordTaskResult(taskId, result);
    this.session.recordTaskExecution(result.success, result.duration || 0);
    
    this.validateInvariants();
    return Result.ok();
  }

  // Advance to next step explicitly
  advanceToNextStep(): Result<void> {
    if (this.plan.isComplete()) {
      return Result.fail('Plan is already complete');
    }
    
    const advanceResult = this.plan.advance();
    if (advanceResult.isFailure()) {
      return Result.fail(`Failed to advance: ${advanceResult.getError()}`);
    }
    
    this.validateInvariants();
    return Result.ok();
  }

  private findTaskById(taskId: string): Task | undefined {
    const currentStep = this.plan.getCurrentStep();
    if (!currentStep) return undefined;
    
    return currentStep.getTasks().find(task => task.getId().toString() === taskId);
  }

  private findTaskByIdInPlan(taskId: any): Task | undefined {
    for (const step of this.plan.getSteps()) {
      const task = step.getTasks().find(t => t.getId().equals(taskId));
      if (task) return task;
    }
    return undefined;
  }

  // Private helper methods
  // Note: validation methods can be added here as needed

  private validateAggregateConsistency(): void {
    if (!this.plan.getWorkflowId().equals(this.workflow.getId())) {
      throw new Error('Plan workflow ID must match workflow ID');
    }

    if (!this.session.getWorkflowId().equals(this.workflow.getId())) {
      throw new Error('Session workflow ID must match workflow ID');
    }
  }

  private validateInvariants(): void {
    // Ensure aggregate invariants are maintained
    if (this.workflow.isComplete() && !this.plan.isComplete()) {
      throw new Error('Workflow cannot be complete with incomplete plan');
    }

    if (this.workflow.isRunning() && !this.session.isActive()) {
      throw new Error('Running workflow must have active session');
    }

    if (this.workflow.isFailed() && this.session.isActive()) {
      throw new Error('Failed workflow cannot have active session');
    }

    // Validate individual entities
    this.workflow.validateInvariants();
    this.session.validateInvariants();
  }

  getDomainEvents(): ReadonlyArray<DomainEvent> {
    return this.domainEvents;
  }

  clearDomainEvents(): void {
    this.domainEvents.splice(0, this.domainEvents.length);
  }
}