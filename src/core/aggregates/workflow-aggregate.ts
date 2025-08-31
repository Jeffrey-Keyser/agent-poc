import { Result } from '../entities/result';
import { Workflow } from '../entities/workflow';
import { Plan } from '../entities/plan';
import { Session } from '../entities/session';
import { Step } from '../entities/step';
import { TaskResult } from '../entities/status-types';

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
  constructor(
    private readonly workflow: Workflow,
    private readonly plan: Plan,
    private readonly session: Session
  ) {
    this.validateAggregateConsistency();
  }

  // Static factory method for creating workflow aggregates
  static create(
    workflow: Workflow,
    plan: Plan,
    session: Session
  ): Result<WorkflowAggregate> {
    // Validate that all entities belong together
    if (!plan.getWorkflowId().equals(workflow.getId())) {
      return Result.fail('Plan does not belong to the workflow');
    }

    if (!session.getWorkflowId().equals(workflow.getId())) {
      return Result.fail('Session does not belong to the workflow');
    }

    // Validate workflow state is compatible
    if (workflow.isComplete() || workflow.isFailed()) {
      return Result.fail('Cannot create aggregate for completed or failed workflow');
    }

    return Result.ok(new WorkflowAggregate(workflow, plan, session));
  }

  // Getters for aggregate components
  getWorkflow(): Workflow {
    return this.workflow;
  }

  getPlan(): Plan {
    return this.plan;
  }

  getSession(): Session {
    return this.session;
  }

  // Core aggregate operation: Execute next step in the plan
  executeNextStep(): Result<StepExecutionResult> {
    // Validate aggregate state before execution
    const validationResult = this.validateExecutionState();
    if (validationResult.isFailure()) {
      return Result.fail(validationResult.getError());
    }

    const currentStep = this.plan.getCurrentStep();
    if (!currentStep) {
      return Result.fail('No current step available in plan');
    }

    // Start the step if not already running
    const stepStartResult = currentStep.start();
    if (stepStartResult.isFailure()) {
      return Result.fail(`Failed to start step: ${stepStartResult.getError()}`);
    }

    // Execute all tasks in the current step
    const tasks = currentStep.getTasks();
    const taskResults: TaskResult[] = [];
    let stepSuccess = true;

    for (const task of tasks) {
      if (task.getStatus() === 'pending') {
        // Mark task as running (this would normally delegate to domain services)
        task.execute();
        
        // In a real implementation, this would delegate to ExecutionService
        // For now, we simulate task execution result
        const taskResult: TaskResult = {
          taskId: task.getId().toString(),
          success: true, // This would come from actual execution
          duration: 1000, // This would be actual execution time
          timestamp: new Date()
        };

        taskResults.push(taskResult);
        
        // Record task completion
        task.complete(taskResult);
        this.workflow.recordTaskResult(task.getId(), taskResult);
        this.session.recordTaskExecution(taskResult.success, taskResult.duration || 0);
        
        if (!taskResult.success) {
          stepSuccess = false;
        }
      }
    }

    // Complete the step
    const stepCompleteResult = currentStep.complete();
    if (stepCompleteResult.isFailure()) {
      stepSuccess = false;
    }

    // Create step execution result
    const stepExecutionResult = new StepExecutionResult(
      currentStep,
      taskResults,
      stepSuccess
    );

    // Check if we should advance to next step or complete workflow
    if (stepSuccess) {
      if (this.plan.isComplete()) {
        // Workflow is complete
        const completionResult = this.workflow.complete(
          'Workflow completed successfully',
          this.extractAggregatedData()
        );
        
        if (completionResult.isFailure()) {
          return Result.fail(`Failed to complete workflow: ${completionResult.getError()}`);
        }

        // End session
        this.session.end();
      } else {
        // Try to advance to next step
        const advanceResult = this.plan.advance();
        if (advanceResult.isFailure()) {
          return Result.fail(`Failed to advance to next step: ${advanceResult.getError()}`);
        }
      }
    } else {
      // Step failed - decide whether to retry or fail workflow
      const criticalTasksFailed = tasks.some(task => 
        task.getPriority().isCritical() && task.getStatus() === 'failed'
      );

      if (criticalTasksFailed) {
        this.workflow.fail('Critical task failed in step execution');
        this.session.markError(
          new Error('Critical task execution failure'),
          'Step execution',
          false
        );
      }
    }

    // Validate aggregate invariants after execution
    this.validateInvariants();

    return Result.ok(stepExecutionResult);
  }

  // Start the entire workflow execution process
  startExecution(): Result<void> {
    // Start workflow
    const workflowStartResult = this.workflow.start();
    if (workflowStartResult.isFailure()) {
      return Result.fail(workflowStartResult.getError());
    }

    // Attach plan if not already attached
    if (!this.workflow.getPlan()) {
      const planAttachResult = this.workflow.attachPlan(this.plan);
      if (planAttachResult.isFailure()) {
        return Result.fail(planAttachResult.getError());
      }
    }

    // Validate session is ready
    if (!this.session.isActive()) {
      return Result.fail('Session is not active');
    }

    this.validateInvariants();
    return Result.ok();
  }

  // Complete the workflow execution
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

  // Private helper methods
  private validateExecutionState(): Result<void> {
    if (!this.workflow.isRunning()) {
      return Result.fail('Workflow is not in running state');
    }

    if (!this.session.isActive()) {
      return Result.fail('Session is not active');
    }

    if (!this.session.isHealthy()) {
      return Result.fail('Session is not healthy');
    }

    return Result.ok();
  }

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

  private extractAggregatedData(): any {
    // This would extract and aggregate data from completed tasks
    // For now, return basic execution summary
    const executionHistory = this.workflow.getExecutionHistory();
    return {
      totalTasks: executionHistory.getEntries().length,
      successfulTasks: executionHistory.getSuccessfulTasks(),
      failedTasks: executionHistory.getFailedTasks(),
      sessionMetrics: this.session.getMetrics(),
      executionDuration: this.session.getDuration().getMilliseconds()
    };
  }
}