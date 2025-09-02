import { Result } from '../entities/result';
import { Workflow } from '../entities/workflow';
import { Plan } from '../entities/plan';
import { Session } from '../entities/session';
import { Step } from '../entities/step';
import { Task } from '../entities/task';
import { TaskResult } from '../entities/status-types';
import { DomainEvent } from '../domain-events';
import { TaskQueue } from '../services/task-queue';
import { StrategicTask } from '../types/agent-types';

// Type definitions for enhanced error context
interface TaskContext {
  stepDescription: string;
  stepIndex: number;
  totalSteps: number;
  workflowGoal: string;
  currentUrl?: string;
}

interface ErrorContext {
  message: string;
  task: StrategicTask;
  failureReason: string;
  dependencies: Array<{
    id: string;
    description: string;
    status: string;
    error?: string;
  }>;
  suggestions: string[];
  timestamp: Date;
}

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
  private taskQueue: TaskQueue;
  private reporter: { log: (message: string) => void } | undefined;

  constructor(
    private readonly workflow: Workflow,
    private readonly plan: Plan,
    private readonly session: Session,
    taskQueue?: TaskQueue, // Optional for backward compatibility
    reporter?: { log: (message: string) => void } // Optional reporter for logging
  ) {
    this.taskQueue = taskQueue || new TaskQueue();
    this.reporter = reporter || undefined;
    this.validateAggregateConsistency();
  }

  // Static factory method for creating workflow aggregates
  static create(
    workflow: Workflow,
    plan: Plan,
    session: Session,
    taskQueue?: TaskQueue,
    reporter?: { log: (message: string) => void }
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

    return Result.ok(new WorkflowAggregate(workflow, plan, session, taskQueue, reporter));
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

  // Core aggregate operation: Execute next step in the plan (now async for parallel execution)
  async executeNextStep(): Promise<Result<StepExecutionResult>> {
    const currentStep = this.plan.getCurrentStep();
    if (!currentStep) {
      return Result.fail('No current step available');
    }
    
    // Start the step if not already running
    const stepStartResult = currentStep.start();
    if (stepStartResult.isFailure()) {
      return Result.fail(`Failed to start step: ${stepStartResult.getError()}`);
    }
    
    // Enqueue all tasks from the step with dependencies
    this.enqueueStepTasks(currentStep);
    
    // Get ready tasks (respecting dependencies)
    const readyTasks = this.taskQueue.getReadyTasks();
    if (readyTasks.length === 0) {
      const blockedTasks = this.taskQueue.getBlockedTasks();
      return Result.fail(`All ${blockedTasks.length} tasks are blocked by dependencies`);
    }
    
    // Execute ready tasks (potentially in parallel)
    const taskResults = await this.executeReadyTasks(readyTasks);
    const stepSuccess = taskResults.every(result => result.success);
    
    // Complete the step
    const stepCompleteResult = currentStep.complete();
    if (stepCompleteResult.isFailure()) {
      return Result.fail(`Failed to complete step: ${stepCompleteResult.getError()}`);
    }
    
    // Create and return step execution result
    const stepExecutionResult = new StepExecutionResult(
      currentStep,
      taskResults,
      stepSuccess
    );
    
    // Handle workflow completion or advancement
    if (stepSuccess) {
      if (this.plan.isComplete()) {
        const completionResult = this.workflow.complete(
          'Workflow completed successfully',
          this.extractAggregatedData()
        );
        if (completionResult.isFailure()) {
          return Result.fail(`Failed to complete workflow: ${completionResult.getError()}`);
        }
        this.session.end();
      } else {
        const advanceResult = this.plan.advance();
        if (advanceResult.isFailure()) {
          return Result.fail(`Failed to advance to next step: ${advanceResult.getError()}`);
        }
      }
    }
    
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

  // Task queue integration methods
  private enqueueStepTasks(step: Step): void {
    const tasks = step.getTasks();
    const tasksList = Array.from(tasks); // Convert readonly array to mutable array
    tasks.forEach((task, index) => {
      const strategicTask = this.convertTaskToStrategicTask(task, step, index, tasksList);
      
      // Check Priority value object API and use appropriate method
      const priority = task.getPriority();
      if (this.isHighPriority(priority)) {
        this.taskQueue.enqueuePriority(strategicTask);
      } else {
        this.taskQueue.enqueue(strategicTask);
      }
    });
  }

  // Comprehensive task conversion with proper type mapping
  private convertTaskToStrategicTask(
    task: Task, 
    step: Step, 
    index: number, 
    allTasks: Task[]
  ): StrategicTask {
    const taskContext = this.buildTaskContext(task, step);
    
    return {
      id: task.getId().toString(),
      name: task.getDescription(),
      description: task.getDescription(),
      intent: this.mapIntentToStrategic(task.getIntent()),
      targetConcept: this.extractTargetConcept(task, taskContext),
      expectedOutcome: this.buildExpectedOutcome(task, step),
      inputData: this.extractInputData(task),
      dependencies: this.extractTaskDependencies(task, index, allTasks),
      maxAttempts: task.getMaxRetries(),
      priority: this.getPriorityValue(task.getPriority()),
      // Enhanced execution fields
      acceptableOutcomes: this.defineAcceptableOutcomes(task, taskContext),
      requiredEvidence: this.defineRequiredEvidence(task.getIntent()),
      optionalEvidence: this.defineOptionalEvidence(task.getIntent()),
      minSuccessConfidence: this.getConfidenceThreshold(task),
      allowPartialSuccess: this.allowsPartialSuccess(task, step)
    };
  }

  // Intent mapping between domain and strategic types
  private mapIntentToStrategic(intent: any): StrategicTask['intent'] {
    const intentMap: Record<string, StrategicTask['intent']> = {
      'Search': 'search',
      'Navigate': 'navigate',
      'Extract': 'extract',
      'Authenticate': 'authenticate',
      'Filter': 'filter',
      'Verify': 'verify',
      'Interact': 'interact',
    };
    
    const intentStr = intent.toString();
    return intentMap[intentStr] || 'interact'; // Default to 'interact' if not mapped
  }

  // Helper methods for Priority value object compatibility
  private isHighPriority(priority: any): boolean {
    // Check if Priority value object has isHigh() method
    if (typeof (priority as any).isHigh === 'function') {
      return (priority as any).isHigh();
    }
    // Fallback: check numeric value
    return this.getPriorityValue(priority) >= 7;
  }
  
  private getPriorityValue(priority: any): number {
    // Check if Priority value object has getNumericValue() method
    if (typeof (priority as any).getNumericValue === 'function') {
      return (priority as any).getNumericValue();
    }
    // Check if it has a value property
    if (typeof (priority as any).value === 'number') {
      return (priority as any).value;
    }
    // Default priority
    return 5;
  }

  private extractTaskDependencies(_task: Task, index: number, allTasks: Task[]): string[] {
    // Default: previous task must complete first (sequential dependency)
    if (index > 0) {
      return [allTasks[index - 1].getId().toString()];
    }
    return [];
  }

  // Task context building methods
  private buildTaskContext(_task: Task, step: Step): TaskContext {
    return {
      stepDescription: step.getDescription(),
      stepIndex: this.plan.getCurrentStepIndex(),
      totalSteps: this.plan.getSteps().length,
      workflowGoal: this.workflow.goal
      // currentUrl is optional and not available from Session entity
    };
  }
  
  private extractTargetConcept(task: Task, _context: any): string {
    // Extract semantic target from task description
    const description = task.getDescription().toLowerCase();
    const conceptPatterns = [
      /(?:click|select|find|locate)\s+(.+)/,
      /(?:enter|type|fill)\s+.+\s+(?:in|into)\s+(.+)/,
      /(?:extract|get|capture)\s+(.+)/
    ];
    
    for (const pattern of conceptPatterns) {
      const match = description.match(pattern);
      if (match) return match[1];
    }
    
    return task.getDescription();
  }
  
  private buildExpectedOutcome(task: Task, _step: Step): string {
    const intent = task.getIntent().toString();
    const description = task.getDescription();
    
    const outcomeTemplates: Record<string, string> = {
      'Search': `Search completed with query entered`,
      'Navigate': `Navigation to target page successful`,
      'Extract': `Data extracted from ${description}`,
      'Authenticate': `Authentication completed successfully`,
      'Filter': `Filters applied as specified`,
      'Verify': `Verification completed: ${description}`,
      'Interact': `Interaction completed: ${description}`
    };
    
    return outcomeTemplates[intent] || `Task completed: ${description}`;
  }
  
  private extractInputData(task: Task): any {
    // Extract input data from task if available
    return (task as any).inputData || undefined;
  }
  
  private defineAcceptableOutcomes(task: Task, _context: any): string[] {
    const intent = task.getIntent().toString();
    
    const outcomesMap: Record<string, string[]> = {
      'Search': ['results displayed', 'no results found', 'search suggestions shown'],
      'Navigate': ['page loaded', 'redirected to login', 'navigation completed'],
      'Extract': ['data captured', 'partial data captured', 'no data available'],
      'Authenticate': ['login successful', 'already authenticated'],
      'Filter': ['filters applied', 'results updated', 'no matches found'],
      'Verify': ['condition met', 'condition not met', 'verification completed'],
      'Interact': ['action completed', 'element updated', 'state changed']
    };
    
    return outcomesMap[intent] || ['task completed'];
  }
  
  private defineRequiredEvidence(intent: any): string[] {
    const intentStr = intent.toString();
    const evidenceMap: Record<string, string[]> = {
      'Search': ['search_input_filled', 'search_submitted'],
      'Navigate': ['page_loaded', 'url_changed'],
      'Extract': ['data_captured', 'elements_found'],
      'Authenticate': ['login_successful', 'session_established'],
      'Filter': ['filter_applied', 'results_updated'],
      'Verify': ['condition_checked', 'assertion_passed'],
      'Interact': ['element_clicked', 'action_completed']
    };
    
    return evidenceMap[intentStr] || ['action_completed'];
  }
  
  private defineOptionalEvidence(intent: any): string[] {
    const intentStr = intent.toString();
    const optionalMap: Record<string, string[]> = {
      'Search': ['autocomplete_shown', 'search_history_displayed'],
      'Navigate': ['page_title_changed', 'breadcrumb_updated'],
      'Extract': ['all_fields_found', 'validation_passed'],
      'Authenticate': ['remember_me_checked', 'two_factor_completed'],
      'Filter': ['count_updated', 'url_params_changed'],
      'Verify': ['screenshot_captured', 'comparison_logged'],
      'Interact': ['animation_completed', 'feedback_shown']
    };
    
    return optionalMap[intentStr] || [];
  }
  
  private getConfidenceThreshold(task: Task): number {
    // High priority tasks require higher confidence
    const priority = this.getPriorityValue(task.getPriority());
    if (priority >= 8) return 0.9;
    if (priority >= 5) return 0.7;
    return 0.5;
  }
  
  private allowsPartialSuccess(task: Task, _step: Step): boolean {
    // Allow partial success for non-critical extraction tasks
    const intent = task.getIntent().toString();
    const priority = this.getPriorityValue(task.getPriority());
    
    return intent === 'Extract' && priority < 7;
  }

  // Parallel task execution method
  private async executeReadyTasks(tasks: StrategicTask[]): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    
    // Group tasks by dependency level for parallel execution
    const independentTasks = tasks.filter(task => task.dependencies.length === 0);
    const dependentTasks = tasks.filter(task => task.dependencies.length > 0);
    
    // Execute independent tasks in parallel using Promise.allSettled
    if (independentTasks.length > 0) {
      this.reporter?.log(`🚀 Executing ${independentTasks.length} independent tasks in parallel`);
      
      const independentResults = await Promise.allSettled(
        independentTasks.map(strategicTask => this.executeTaskAsync(strategicTask))
      );
      
      // Process parallel execution results with comprehensive error handling
      independentResults.forEach((promiseResult, index) => {
        const strategicTask = independentTasks[index];
        
        if (promiseResult.status === 'fulfilled') {
          const taskResult = promiseResult.value;
          results.push(taskResult);
          
          if (taskResult.success) {
            this.taskQueue.markCompleted(strategicTask.id);
          } else {
            const errorContext = this.buildTaskErrorContext(strategicTask, taskResult);
            this.taskQueue.markFailed(strategicTask.id, errorContext.message);
            this.reporter?.log(`❌ Task failed: ${errorContext.message}`);
          }
        } else {
          // Handle rejected promise with rich error context
          const errorContext = this.buildRejectionErrorContext(strategicTask, promiseResult.reason);
          const errorResult: TaskResult = {
            taskId: strategicTask.id,
            success: false,
            error: errorContext.message,
            timestamp: new Date()
          };
          
          results.push(errorResult);
          this.taskQueue.markFailed(strategicTask.id, errorContext.message);
          this.reporter?.log(`❌ Task rejected: ${errorContext.message}`);
        }
      });
    }
    
    // Execute dependent tasks sequentially
    for (const strategicTask of dependentTasks) {
      const task = this.findTaskById(strategicTask.id);
      if (!task) continue;
      
      // Enhanced dependency checking with detailed errors
      if (!this.taskQueue.areDependenciesMet(strategicTask)) {
        const unmetDeps = this.taskQueue.getUnmetDependencies(strategicTask);
        const errorContext = this.buildDependencyErrorContext(strategicTask, unmetDeps);
        this.taskQueue.markBlocked(strategicTask);
        
        // Log detailed dependency failure with suggestions
        this.reporter?.log(`🚫 Task blocked: ${errorContext.message}`);
        this.reporter?.log(`   Dependencies: ${errorContext.dependencies.map(d => d.description).join(', ')}`);
        this.reporter?.log(`   Suggestions: ${errorContext.suggestions.join('; ')}`);
        
        throw new Error(errorContext.message);
      }
      
      const result = await this.executeTaskAsync(strategicTask);
      results.push(result);
      
      // Mark completed in queue with event emission
      if (result.success) {
        this.taskQueue.markCompleted(strategicTask.id);
      } else {
        const errorContext = this.buildTaskErrorContext(strategicTask, result);
        this.taskQueue.markFailed(strategicTask.id, errorContext.message);
      }
    }
    
    return results;
  }

  // Async task execution method for parallel processing
  private async executeTaskAsync(strategicTask: StrategicTask): Promise<TaskResult> {
    const task = this.findTaskById(strategicTask.id);
    if (!task) {
      return {
        taskId: strategicTask.id,
        success: false,
        error: 'Task not found in current step',
        timestamp: new Date()
      };
    }
    
    try {
      // Start task execution
      const executeResult = task.execute();
      if (executeResult.isFailure()) {
        return {
          taskId: strategicTask.id,
          success: false,
          error: executeResult.getError(),
          timestamp: new Date()
        };
      }
      
      // Simulate async task execution (in real implementation, this would delegate to ExecutionService)
      await new Promise(resolve => setTimeout(resolve, 50)); // Simulate async work
      
      const taskResult: TaskResult = {
        taskId: task.getId().toString(),
        success: Math.random() > 0.1, // 90% success rate for simulation
        duration: Math.floor(Math.random() * 2000) + 500, // 500-2500ms
        timestamp: new Date()
      };
      
      // Complete the task
      if (taskResult.success) {
        task.complete(taskResult);
        this.workflow.recordTaskResult(task.getId(), taskResult);
        this.session.recordTaskExecution(taskResult.success, taskResult.duration || 0);
      } else {
        task.fail(new Error('Simulated task failure'));
      }
      
      return taskResult;
    } catch (error) {
      return {
        taskId: strategicTask.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during task execution',
        timestamp: new Date()
      };
    }
  }
  
  private findTaskById(taskId: string): Task | undefined {
    const currentStep = this.plan.getCurrentStep();
    if (!currentStep) return undefined;
    
    return currentStep.getTasks().find(task => task.getId().toString() === taskId);
  }

  // Enhanced error context methods for rich error reporting
  private buildDependencyErrorContext(task: StrategicTask, unmetDeps: string[]): ErrorContext {
    const dependencyDetails = unmetDeps.map(depId => {
      const depTask = this.findTaskById(depId);
      const taskError = depTask?.getError()?.message;
      return {
        id: depId,
        description: depTask?.getDescription() || 'Unknown task',
        status: depTask?.getStatus() || 'unknown',
        ...(taskError && { error: taskError })
      };
    });
    
    return {
      message: `Task ${task.id} blocked by ${unmetDeps.length} unmet dependencies: ${unmetDeps.join(', ')}`,
      task: task,
      failureReason: 'Unmet dependencies',
      dependencies: dependencyDetails,
      suggestions: this.generateRecoverySuggestions(task, dependencyDetails),
      timestamp: new Date()
    };
  }
  
  private buildTaskErrorContext(task: StrategicTask, result: TaskResult): ErrorContext {
    return {
      message: result.error || `Task ${task.id} failed`,
      task: task,
      failureReason: 'Task execution failed',
      dependencies: [],
      suggestions: [
        'Check task preconditions',
        'Verify page state matches expectations',
        'Consider retry with modified parameters'
      ],
      timestamp: new Date()
    };
  }
  
  private buildRejectionErrorContext(task: StrategicTask, reason: any): ErrorContext {
    const errorMessage = reason?.message || reason?.toString() || 'Unknown error';
    return {
      message: `Task ${task.id} rejected: ${errorMessage}`,
      task: task,
      failureReason: 'Promise rejection',
      dependencies: [],
      suggestions: [
        'Check for runtime errors in task execution',
        'Verify async operations are properly handled',
        'Review task timeout settings'
      ],
      timestamp: new Date()
    };
  }
  
  private generateRecoverySuggestions(_task: StrategicTask, dependencies: any[]): string[] {
    const suggestions: string[] = [];
    
    // Check for failed dependencies
    const failedDeps = dependencies.filter(d => d.status === 'failed');
    if (failedDeps.length > 0) {
      suggestions.push(`Retry failed dependencies: ${failedDeps.map(d => d.id).join(', ')}`);
    }
    
    // Check for stuck dependencies
    const runningDeps = dependencies.filter(d => d.status === 'running');
    if (runningDeps.length > 0) {
      suggestions.push(`Wait for running dependencies: ${runningDeps.map(d => d.id).join(', ')}`);
    }
    
    // General recovery suggestions
    suggestions.push('Consider replanning with modified strategy');
    suggestions.push('Check if manual intervention is required');
    
    return suggestions;
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

  // Domain events support
  getDomainEvents(): ReadonlyArray<DomainEvent> {
    return this.domainEvents;
  }

  clearDomainEvents(): void {
    this.domainEvents.splice(0, this.domainEvents.length);
  }
}