# Workflow Execution Fix Plan

## Executive Summary
The multi-agent workflow system is failing due to architectural conflicts between WorkflowAggregate and WorkflowManager, resulting in tasks not being executed properly. This document outlines the specific code changes needed to fix these issues.

## Root Cause Analysis

### Current Architecture Problems

1. **Duplicate Execution Paths**
   - WorkflowAggregate has its own task execution logic with simulated results
   - WorkflowManager attempts to execute the same tasks through ExecutionService
   - This causes "Task not found" errors and no actual browser actions

2. **Task State Management Issues**
   - Tasks are enqueued by WorkflowAggregate but not accessible to WorkflowManager
   - ExecutionContext maintains single task state causing "Another task is already being executed" errors
   - Task retry logic fails due to improper state transitions

3. **Simulated vs Real Execution**
   - WorkflowAggregate.executeTaskAsync() uses Math.random() for success (line 562)
   - Real browser actions through ExecutionService never get called
   - Results are fake, not based on actual page interactions

## Detailed Changes Required

### 1. Fix WorkflowAggregate.executeNextStep() 
**File**: `src/core/aggregates/workflow-aggregate.ts`
**Lines**: 119-172

#### Current Code Problem:
```typescript
async executeNextStep(): Promise<Result<StepExecutionResult>> {
  // Lines 130: Enqueues tasks to TaskQueue
  this.enqueueStepTasks(currentStep);
  
  // Lines 138: Executes tasks internally with simulated results
  const taskResults = await this.executeReadyTasks(readyTasks);
}
```

#### Change Required:
```typescript
async executeNextStep(): Promise<Result<StepExecutionResult>> {
  const currentStep = this.plan.getCurrentStep();
  if (!currentStep) {
    return Result.fail('No current step available');
  }
  
  const stepStartResult = currentStep.start();
  if (stepStartResult.isFailure()) {
    return Result.fail(`Failed to start step: ${stepStartResult.getError()}`);
  }
  
  // REMOVE: Task enqueueing and execution
  // RETURN: Just the step for external execution
  const stepExecutionResult = new StepExecutionResult(
    currentStep,
    [], // Empty results - will be filled by WorkflowManager
    false // Not complete yet
  );
  
  return Result.ok(stepExecutionResult);
}
```

### 2. Remove/Refactor executeTaskAsync()
**File**: `src/core/aggregates/workflow-aggregate.ts`
**Lines**: 534-585

#### Current Code Problem:
```typescript
private async executeTaskAsync(strategicTask: StrategicTask): Promise<TaskResult> {
  // Line 562: Simulated execution
  success: Math.random() > 0.1, // 90% success rate for simulation
}
```

#### Change Required:
**Option A - Complete Removal:**
- Delete the entire method
- Remove references from executeReadyTasks()

**Option B - Integration with ExecutionService:**
```typescript
private async executeTaskAsync(
  strategicTask: StrategicTask, 
  executionService: ExecutionService,
  executionContext: any
): Promise<TaskResult> {
  const task = this.findTaskById(strategicTask.id);
  if (!task) {
    return {
      taskId: strategicTask.id,
      success: false,
      error: 'Task not found in current step',
      timestamp: new Date()
    };
  }
  
  // Use real execution service
  const executionResult = await executionService.executeTask(task, executionContext);
  
  if (executionResult.isSuccess()) {
    const result = executionResult.getValue();
    task.complete({
      taskId: task.getId().toString(),
      success: true,
      data: result.evidence,
      timestamp: new Date()
    });
    return {
      taskId: task.getId().toString(),
      success: true,
      data: result.evidence,
      timestamp: new Date()
    };
  } else {
    task.fail(new Error(executionResult.getError()));
    return {
      taskId: task.getId().toString(),
      success: false,
      error: executionResult.getError(),
      timestamp: new Date()
    };
  }
}
```

### 3. Fix ExecutionContext State Management
**File**: `src/core/entities/execution-context.ts`
**Lines**: 178-202

#### Current Code Problem:
```typescript
startTaskExecution(taskId: TaskId): Result<void> {
  if (this.currentTaskId) {
    return Result.fail('Another task is already being executed');
  }
  this.currentTaskId = taskId;
  return Result.ok();
}

completeTaskExecution(result: TaskResult): Result<void> {
  // Never clears currentTaskId
}
```

#### Change Required:
```typescript
startTaskExecution(taskId: TaskId): Result<void> {
  if (this.currentTaskId) {
    return Result.fail('Another task is already being executed');
  }
  this.currentTaskId = taskId;
  this.updatedAt = new Date();
  return Result.ok();
}

completeTaskExecution(result: TaskResult): Result<void> {
  if (!this.currentTaskId) {
    return Result.fail('No task is currently being executed');
  }

  if (this.currentTaskId.toString() !== result.taskId) {
    return Result.fail('Task result does not match current task');
  }

  this.lastExecutionResult = result;
  this.executionHistory.push(result);
  this.executionCount++;
  
  // CRITICAL: Clear current task to allow next execution
  this.currentTaskId = null;
  this.updatedAt = new Date();
  
  return Result.ok();
}

// ADD: Method to force clear stuck executions
forceResetExecution(): void {
  this.currentTaskId = null;
  this.updatedAt = new Date();
}
```

### 4. Refactor WorkflowManager Execution Loop
**File**: `src/core/services/workflow-manager.ts`
**Lines**: 331-551

#### Current Code Problem:
- Complex interleaving of WorkflowAggregate and ExecutionAggregate
- TaskQueue operations that conflict with WorkflowAggregate
- No proper coordination between the two execution paths

#### Change Required:
```typescript
// Simplified execution loop
while (true) {
  // Get next step from workflow aggregate (without execution)
  const stepResult = await this.workflowAggregate!.getNextStep();
  if (stepResult.isFailure()) {
    this.reporter.log(`No more steps to execute: ${stepResult.getError()}`);
    break;
  }
  
  const currentStep = stepResult.getValue();
  this.reporter.log(`⚡ Executing step: ${currentStep.getDescription()}`);
  
  // Mark step as started
  const stepStartResult = currentStep.start();
  if (stepStartResult.isFailure()) {
    this.reporter.log(`Failed to start step: ${stepStartResult.getError()}`);
    continue;
  }
  
  const tasks = currentStep.getTasks();
  const stepTaskResults: TaskResult[] = [];
  
  for (const task of tasks) {
    // Reset execution context if needed
    if (this.executionAggregate) {
      const context = this.executionAggregate.getContext();
      if (context.getCurrentTaskId()) {
        this.executionAggregate.getContext().forceResetExecution();
      }
    }
    
    // Start task execution
    const startExecutionResult = this.executionAggregate!.startTaskExecution(task);
    if (startExecutionResult.isFailure()) {
      this.reporter.log(`Failed to start task: ${startExecutionResult.getError()}`);
      
      // Create failure result
      const failureResult: TaskResult = {
        taskId: task.getId().toString(),
        success: false,
        error: startExecutionResult.getError(),
        timestamp: new Date()
      };
      stepTaskResults.push(failureResult);
      continue;
    }
    
    try {
      // Execute with real execution service
      const executionContext = this.buildExecutionContext(task);
      const executionResult = await this.executionService.executeTask(task, executionContext);
      
      let taskResult: TaskResult;
      if (executionResult.isSuccess()) {
        const result = executionResult.getValue();
        
        // Evaluate the result
        const evaluationResult = await this.evaluationService.evaluateTaskCompletion(
          task,
          result.evidence,
          this.buildEvaluationContext()
        );
        
        taskResult = {
          taskId: task.getId().toString(),
          success: evaluationResult.isSuccess(),
          duration: Date.now() - taskStartTime,
          data: result.evidence ? result.evidence.map(e => e.getData()) : [],
          timestamp: new Date(),
          ...(evaluationResult.isFailure() && { error: evaluationResult.getError() })
        };
      } else {
        taskResult = {
          taskId: task.getId().toString(),
          success: false,
          error: executionResult.getError(),
          timestamp: new Date()
        };
      }
      
      // Record in execution aggregate
      const recordResult = await this.executionAggregate!.recordExecution(
        task,
        taskResult,
        evidence,
        `Step: ${currentStep.getDescription()}`
      );
      
      if (recordResult.isFailure()) {
        this.reporter.log(`Failed to record execution: ${recordResult.getError()}`);
      }
      
      // Update task state in workflow aggregate
      if (taskResult.success) {
        task.complete(taskResult);
        this.workflowAggregate!.recordTaskCompletion(task.getId(), taskResult);
      } else {
        task.fail(new Error(taskResult.error || 'Task execution failed'));
        
        // Handle retry
        if (task.canRetry()) {
          this.reporter.log(`🔄 Retrying task ${task.getRetryCount()}/${task.getMaxRetries()}`);
          const retryResult = task.retry();
          if (retryResult.isSuccess()) {
            // Re-add to current iteration
            tasks.push(task);
          }
        }
      }
      
      stepTaskResults.push(taskResult);
      
    } catch (error) {
      const errorResult: TaskResult = {
        taskId: task.getId().toString(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      };
      stepTaskResults.push(errorResult);
      task.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  // Complete step with actual results
  const stepSuccess = stepTaskResults.every(r => r.success);
  const completeStepResult = this.workflowAggregate!.completeStep(
    currentStep.getId(),
    stepTaskResults
  );
  
  if (completeStepResult.isFailure()) {
    this.reporter.log(`Failed to complete step: ${completeStepResult.getError()}`);
  }
  
  this.reporter.log(`✅ Step completed: ${currentStep.getDescription()} (Success: ${stepSuccess})`);
  
  // Check if workflow is complete
  const status = this.workflowAggregate!.getExecutionStatus();
  if (status.completionPercentage >= 100) {
    this.reporter.log('🎉 Workflow completed successfully');
    break;
  }
  
  // Advance to next step if successful
  if (stepSuccess) {
    const advanceResult = this.workflowAggregate!.advanceToNextStep();
    if (advanceResult.isFailure()) {
      this.reporter.log(`Cannot advance: ${advanceResult.getError()}`);
      break;
    }
  } else {
    // Handle step failure - maybe replan
    if (this.config.enableReplanning) {
      const replanRequired = await this.checkForReplanning();
      if (replanRequired) {
        this.reporter.log(`🔄 Replanning due to step failure`);
      }
    }
  }
}
```

### 5. Fix Task Retry Logic
**File**: `src/core/entities/task.ts`

#### Current Code Problem:
- Task.retry() fails with "Task is not in retrying state"
- State machine doesn't properly transition from FAILED to RETRYING

#### Change Required:
```typescript
retry(): Result<void> {
  // Allow retry from FAILED state, not just RETRYING
  if (this.status !== 'failed' && this.status !== 'retrying') {
    return Result.fail('Task must be in failed state to retry');
  }
  
  if (this.retryCount >= this.maxRetries) {
    return Result.fail('Maximum retry attempts exceeded');
  }
  
  this.retryCount++;
  this.status = 'pending'; // Reset to pending for re-execution
  this.updatedAt = new Date();
  
  this.addDomainEvent(
    new TaskRetriedEvent(
      this.id,
      this.retryCount,
      this.maxRetries,
      new Date()
    )
  );
  
  return Result.ok();
}
```

### 6. Add New WorkflowAggregate Methods
**File**: `src/core/aggregates/workflow-aggregate.ts`

#### New Methods Required:
```typescript
// Get next step without executing
getNextStep(): Result<Step> {
  const currentStep = this.plan.getCurrentStep();
  if (!currentStep) {
    return Result.fail('No current step available');
  }
  return Result.ok(currentStep);
}

// Complete a step with external results
completeStep(stepId: StepId, results: TaskResult[]): Result<void> {
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
  
  // Complete the step
  const stepSuccess = results.every(r => r.success);
  const completeResult = currentStep.complete();
  if (completeResult.isFailure()) {
    return Result.fail(`Failed to complete step: ${completeResult.getError()}`);
  }
  
  // Advance plan if successful
  if (stepSuccess && !this.plan.isComplete()) {
    const advanceResult = this.plan.advance();
    if (advanceResult.isFailure()) {
      return Result.fail(`Failed to advance plan: ${advanceResult.getError()}`);
    }
  }
  
  this.validateInvariants();
  return Result.ok();
}

// Record task completion from external execution
recordTaskCompletion(taskId: TaskId, result: TaskResult): Result<void> {
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

private findTaskByIdInPlan(taskId: TaskId): Task | undefined {
  for (const step of this.plan.getSteps()) {
    const task = step.getTasks().find(t => t.getId().equals(taskId));
    if (task) return task;
  }
  return undefined;
}
```

## Implementation Order

1. **Phase 1: Fix ExecutionContext** (Priority: Critical) ✅ **COMPLETED**
   - ✅ Add currentTaskId cleanup in completeTaskExecution() (already implemented correctly)
   - ✅ Add forceResetExecution() method (added at line 207-210)
   - ✅ Build validation completed successfully

2. **Phase 2: Refactor WorkflowAggregate** (Priority: Critical) ✅ **COMPLETED**
   - ✅ Modify executeNextStep() to return step without execution (lines 90-107)
   - ✅ Add new methods for external result recording (getNextStep, completeStep, recordTaskCompletion, advanceToNextStep)
   - ✅ Remove executeTaskAsync() simulation and task queue operations
   - ✅ Clean up imports, remove TaskQueue and StrategicTask dependencies
   - ✅ Update constructor and static factory method signatures
   - ✅ Fix workflow-manager.ts to use new aggregate signature
   - ✅ Build validation completed successfully

3. **Phase 3: Update WorkflowManager** (Priority: Critical) ✅ **COMPLETED**
   - ✅ Simplify execution loop using WorkflowAggregate.getNextStep() instead of executeNextStep()
   - ✅ Remove TaskQueue operations from main loop (removed import, instantiation, and event listeners)
   - ✅ Integrate proper ExecutionService calls with buildExecutionContext() helper method
   - ✅ Use WorkflowAggregate.completeStep() and advanceToNextStep() for proper coordination
   - ✅ Add forceResetExecution() calls to prevent "Another task is already being executed" errors
   - ✅ Implement real task retry logic with proper state transitions
   - ✅ Add buildEvaluationContext() helper for proper task evaluation
   - ✅ Build validation completed successfully

4. **Phase 4: Fix Task Retry** (Priority: High) ✅ **COMPLETED**
   - ✅ Update Task entity state machine to allow retry from FAILED state (lines 252-254)
   - ✅ Allow retry from FAILED state in addition to RETRYING state
   - ✅ Reset to PENDING for re-execution with proper retry counter increment (lines 261-268)
   - ✅ Improve error messages for better debugging
   - ✅ Build validation completed successfully

5. **Phase 5A: Fix Step State Management** (Priority: Critical) ✅ **COMPLETED**
   - ✅ Add Step retry logic to Step entity (retry, canRetry, resetForRetry methods)
   - ✅ Update WorkflowAggregate step completion logic for retry handling
   - ✅ Update WorkflowManager step failure handling and retry logic  
   - ✅ Add step state validation and safeguards
   - ✅ Add infinite loop protection in WorkflowManager execution
   - ✅ Build validation completed successfully

6. **Phase 5B: Testing & Validation** (Priority: High)
   - Test with agent-amazon-multi.ts
   - Verify actual browser actions occur
   - Confirm proper progress tracking

## Expected Outcomes

### Before Fix:
- No actual browser actions executed
- "Task not found in current step" errors
- "Another task is already being executed" errors
- 0% success rate with simulated results
- Workflow fails at 33% completion

### After Fix:
- Real browser actions via ExecutionService
- Proper task state management
- Sequential/parallel task execution as designed
- Actual extraction of data from web pages
- Complete workflow execution with real results

## Risk Mitigation

1. **Backward Compatibility**
   - Keep WorkflowAggregate public API unchanged
   - Maintain event emission for monitoring
   - Preserve domain event patterns

2. **Testing Strategy**
   - Unit test each changed component
   - Integration test the full workflow
   - Use agent-amazon-multi.ts as acceptance test

3. **Rollback Plan**
   - Tag current version before changes
   - Implement changes in feature branch
   - Merge only after full validation

## Success Metrics

- [ ] No "Task not found" errors
- [ ] No "Another task is already being executed" errors  
- [ ] Real browser actions executed (verified via screenshots)
- [ ] Workflow completes at 100% (not 33%)
- [ ] Actual data extracted from web pages
- [ ] Retry logic works for failed tasks
- [ ] Progress tracking shows accurate percentages

## Notes

- The core issue is architectural: two competing execution models
- The fix consolidates execution responsibility in WorkflowManager
- WorkflowAggregate becomes pure orchestration/state management
- ExecutionService handles all real browser interactions
- This separation of concerns will make the system more maintainable