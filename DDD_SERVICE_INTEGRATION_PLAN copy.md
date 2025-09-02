# DDD Service Integration Plan: TaskQueue, WorkflowMonitor, and StateManager

## Plan Adjustments & Critical Requirements

**Updated based on architecture analysis and implementation lessons learned**

### 🚨 CRITICAL IMPROVEMENTS FROM ORIGINAL PLAN

This updated plan addresses significant gaps discovered during Phase 1 analysis:

1. **Missing True Parallel Execution**: Original plan mentioned parallel execution but lacked the actual `executeTaskAsync()` implementation and proper `Promise.allSettled()` handling
2. **Incomplete Error Handling**: Missing `markFailed()` and `markBlocked()` methods with proper event emission for monitoring
3. **No Memory Management**: Original plan didn't account for memory growth in large task graphs - added `cleanupCompletedTasks()`
4. **Insufficient Event Integration**: Missing comprehensive event bridging between TaskQueue and system EventBus
5. **Limited Observability**: Enhanced monitoring with 7 event types instead of basic 4, plus real-time queue status reporting
6. **Incomplete Task Conversion**: Missing proper mapping of all StrategicTask fields including `targetConcept`, `expectedOutcome`, `acceptableOutcomes`, `requiredEvidence`, etc.
7. **Missing Configuration Interface**: No WorkflowManagerConfig updates for feature toggles and integration options
8. **Lack of Error Context**: Missing rich error context with dependency details and recovery suggestions
9. **No Testing Strategy**: Original plan lacked specific unit and integration test requirements
10. **Missing Factory Pattern**: No AgentFactory updates for creating fully integrated WorkflowManager instances

These improvements ensure the implementation will be **production-ready** rather than just a basic integration.

Before beginning implementation, several critical requirements and potential gaps have been identified that must be addressed to ensure successful integration:

### Critical Prerequisites Identified:

1. **Event-Driven TaskQueue Integration**
   - **Requirement**: TaskQueue must support EventEmitter functionality for monitoring integration
   - **Impact**: Phase 3 WorkflowMonitor integration depends on queue events
   - **Action**: Enhance TaskQueue with event emission before Phase 3

2. **Parallel Task Execution Design**
   - **Requirement**: True parallel execution capability for independent ready tasks
   - **Impact**: Core performance benefits depend on this capability
   - **Action**: Design parallel execution strategy in Phase 1
   - **Critical Gap**: Original plan lacked `executeTaskAsync()` method and proper Promise.allSettled implementation

3. **Enhanced Error Handling Strategy**
   - **Requirement**: Dependency-specific error context and detailed reporting
   - **Impact**: Essential for debugging complex dependency chains
   - **Action**: Include comprehensive error handling in initial design
   - **Critical Gap**: Original plan didn't include `markFailed()` and `markBlocked()` methods with event emission

4. **Performance & Scalability Considerations**
   - **Requirement**: High-priority fast-tracking and memory management for large graphs
   - **Impact**: System must handle enterprise-scale task dependencies
   - **Action**: Design performance optimizations from the start
   - **Critical Gap**: Original plan lacked memory management strategy (`cleanupCompletedTasks()`)

5. **Event-Driven Monitoring Integration**
   - **Requirement**: Complete event bridging between TaskQueue and system EventBus
   - **Impact**: Cross-component monitoring and observability depends on event propagation
   - **Action**: Implement comprehensive event listeners in WorkflowManager
   - **Critical Gap**: Original plan didn't specify event bridging architecture

### Updated Phase Structure:

- **Phase 1**: TaskQueue Integration with DDD Aggregates (includes event system and parallel execution)
- **Phase 2**: Enhanced StateManager Integration with Aggregates  
- **Phase 3**: WorkflowMonitor Domain Event Integration (depends on Phase 1 events)

## Executive Summary

This document outlines the integration plan for three currently underutilized service classes (TaskQueue, WorkflowMonitor, StateManager) into the Domain-Driven Design (DDD) model that was recently implemented. These services are instantiated in `init-multi-agent.ts` but not fully integrated with the new domain entities and aggregates.

## Current State Analysis

### 1. TaskQueue (`src/core/services/task-queue.ts`)

**Current Status:**
- ✅ Fully implemented with priority queuing and dependency management
- ✅ Supports priority and regular queues with dependency resolution
- ❌ Only instantiated in `init-multi-agent.ts` (line 98) but not actively used
- ❌ Not integrated with Task entities or WorkflowAggregate

**Capabilities:**
- Priority-based task scheduling
- Dependency graph management
- Parallel task identification (`getReadyTasks()`)
- Blocked task tracking (`getBlockedTasks()`)

**Integration Gap:**
- Task entities have Priority value objects but don't use TaskQueue
- WorkflowAggregate executes tasks sequentially without considering dependencies
- No persistence or recovery of queue state
- **Missing EventEmitter functionality for monitoring integration**
- **No parallel execution capability for independent tasks**

### 2. WorkflowMonitor (`src/core/services/workflow-monitor.ts`)

**Current Status:**
- ✅ Instantiated in `init-multi-agent.ts` and WorkflowManager
- ✅ Actively listening to workflow events via EventBus
- ✅ Comprehensive metrics collection and reporting
- ⚠️ Only monitoring legacy events, not DDD domain events
- ❌ Not tracking TaskQueue or advanced StateManager metrics

**Capabilities:**
- Event-driven monitoring system
- Workflow, step, and task metrics
- Performance tracking and duration analysis
- Error and replan counting

**Integration Gap:**
- Domain events (WorkflowStartedEvent, TaskCompletedEvent, etc.) not bridged
- TaskQueue metrics not captured
- StateManager checkpoint events not monitored

### 3. StateManager (`src/core/services/state-manager.ts`)

**Current Status:**
- ✅ Actively used in WorkflowManager for state capture
- ✅ Integrated for data extraction and persistence
- ⚠️ Not integrated with ExecutionAggregate
- ❌ Checkpointing feature unused
- ❌ State comparison not used for replanning decisions

**Capabilities:**
- Advanced page state capture with screenshots
- Semantic page analysis (sections, actions, elements)
- Checkpoint creation and recovery
- Persistent data management
- State change detection

**Integration Gap:**
- ExecutionAggregate doesn't leverage state context
- Checkpoints not used for workflow recovery
- State changes don't trigger adaptive replanning

## Integration Architecture

### High-Level Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                     WorkflowAggregate                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Workflow   │  │     Plan     │  │   Session    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                  │                  │             │
│         └──────────────────┴──────────────────┘             │
│                           │                                 │
│                    ┌──────▼──────┐                         │
│                    │  TaskQueue  │ ◄── Integration Point 1 │
│                    └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   ExecutionAggregate                         │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │ExecutionContext│ │ExecutionResult│                       │
│  └──────────────┘  └──────────────┘                        │
│         │                  │                                │
│         └──────────────────┘                                │
│                  │                                          │
│           ┌──────▼──────┐                                  │
│           │StateManager │ ◄── Integration Point 2          │
│           └──────────────┘                                  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   WorkflowMonitor                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │Domain Events │  │Queue Events  │  │State Events  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                    Integration Point 3                      │
└─────────────────────────────────────────────────────────────┘
```

## Detailed Implementation Plan

### Phase 1: TaskQueue Integration with DDD Aggregates
**Duration**: 3-4 days | **Priority**: High | **Risk**: Medium

**Updated Requirements**: This phase now includes event system integration and parallel execution capability as critical prerequisites for Phase 3.

#### 1.0 Enhance TaskQueue with Event System (Prerequisite)

**File**: `src/core/services/task-queue.ts`

```typescript
import { EventEmitter } from 'events';

export class TaskQueue extends EventEmitter {
  // ... existing properties
  
  constructor() {
    super();
    // ... existing initialization
  }
  
  enqueue(task: StrategicTask): void {
    this.queue.push(task);
    this.updateDependencyMap(task);
    this.sort();
    
    // **NEW**: Emit event for monitoring
    this.emit('task:enqueued', { 
      task, 
      queueSize: this.size(),
      readyCount: this.getReadyTasks().length,
      blockedCount: this.getBlockedTasks().length 
    });
  }
  
  dequeue(): StrategicTask | null {
    const task = this.findAndRemoveReadyTask();
    if (task) {
      // **NEW**: Emit event for monitoring  
      this.emit('task:dequeued', { task, remainingSize: this.size() });
    }
    return task;
  }
  
  // **NEW**: Enhanced dependency analysis
  getUnmetDependencies(task: StrategicTask): string[] {
    return task.dependencies.filter(depId => !this.completedTasks.has(depId));
  }
  
  // **NEW**: Performance optimization for high-priority tasks
  optimizeForHighPriority(): void {
    // Fast-track high priority tasks when queue size > 10
    if (this.size() > 10) {
      // Sort priority queue by priority value (highest first)
      this.priorityQueue.sort((a, b) => b.priority - a.priority);
      
      // Emit optimization event for monitoring
      this.emit('queue:optimized', { 
        queueSize: this.size(),
        priorityTasks: this.priorityQueue.length
      });
    }
  }
  
  // **NEW**: Enhanced error handling and monitoring
  markFailed(taskId: string, error: string): void {
    // Emit event for monitoring
    this.emit('task:failed', { taskId, error, timestamp: new Date() });
  }

  markBlocked(task: StrategicTask): void {
    const unmetDeps = this.getUnmetDependencies(task);
    
    // Emit event for monitoring
    this.emit('task:blocked', { 
      task, 
      dependencies: task.dependencies,
      unmetDependencies: unmetDeps,
      blockedCount: this.getBlockedTasks().length
    });
  }
  
  // **NEW**: Memory management for large task graphs
  cleanupCompletedTasks(): void {
    // Keep only last 100 completed tasks to prevent memory growth
    if (this.completedTasks.size > 100) {
      const tasksArray = Array.from(this.completedTasks);
      const toRemove = tasksArray.slice(0, tasksArray.length - 100);
      toRemove.forEach(taskId => this.completedTasks.delete(taskId));
      
      this.emit('queue:cleanup', { 
        removedCount: toRemove.length, 
        remainingCount: this.completedTasks.size 
      });
    }
  }
}
```

#### 1.1 Enhance WorkflowAggregate with TaskQueue

**File**: `src/core/aggregates/workflow-aggregate.ts`

```typescript
// Add required imports
import { Task } from '../entities/task';
import { TaskQueue } from '../services/task-queue';
import { StrategicTask } from '../types/agent-types';

export class WorkflowAggregate {
  private taskQueue: TaskQueue;
  private reporter?: { log: (message: string) => void };
  
  constructor(
    private readonly workflow: Workflow,
    private readonly plan: Plan,
    private readonly session: Session,
    taskQueue?: TaskQueue, // Optional for backward compatibility
    reporter?: { log: (message: string) => void } // Optional reporter for logging
  ) {
    this.taskQueue = taskQueue || new TaskQueue();
    this.reporter = reporter;
    this.validateAggregateConsistency();
  }
  
  // Update static factory method
  static create(
    workflow: Workflow,
    plan: Plan,
    session: Session,
    taskQueue?: TaskQueue,
    reporter?: { log: (message: string) => void }
  ): Result<WorkflowAggregate> {
    // ... existing validation logic
    return Result.ok(new WorkflowAggregate(workflow, plan, session, taskQueue, reporter));
  }
  
  // Enhanced execution with queue-based scheduling (now async for parallel execution)
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
      stepSuccess = false;
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
  
  private enqueueStepTasks(step: Step): void {
    const tasks = step.getTasks();
    tasks.forEach((task, index) => {
      const strategicTask = this.convertTaskToStrategicTask(task, step, index, tasks);
      
      // Check Priority value object API and use appropriate method
      const priority = task.getPriority();
      if (this.isHighPriority(priority)) {
        this.taskQueue.enqueuePriority(strategicTask);
      } else {
        this.taskQueue.enqueue(strategicTask);
      }
    });
  }
  
  // **CRITICAL**: Comprehensive task conversion with proper type mapping
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
  
  // **CRITICAL**: Intent mapping between domain and strategic types
  private mapIntentToStrategic(intent: Intent): StrategicTask['intent'] {
    const intentMap: Record<string, StrategicTask['intent']> = {
      'Search': 'search',
      'Navigate': 'navigate',
      'Extract': 'extract',
      'Authenticate': 'authenticate',
      'Filter': 'filter',
      'Verify': 'verify',
      'Interact': 'interact',
      // Add more mappings as needed
    };
    
    const intentStr = intent.toString();
    return intentMap[intentStr] || 'interact'; // Default to 'interact' if not mapped
  }
  
  // Helper methods for Priority value object compatibility
  private isHighPriority(priority: Priority): boolean {
    // Check if Priority value object has isHigh() method
    if (typeof (priority as any).isHigh === 'function') {
      return (priority as any).isHigh();
    }
    // Fallback: check numeric value
    return this.getPriorityValue(priority) >= 7;
  }
  
  private getPriorityValue(priority: Priority): number {
    // Check if Priority value object has getValue() method
    if (typeof (priority as any).getValue === 'function') {
      return (priority as any).getValue();
    }
    // Fallback: check if it has a value property
    if (typeof (priority as any).value === 'number') {
      return (priority as any).value;
    }
    // Default priority
    return 5;
  }
  
  private extractTaskDependencies(task: Task, index: number, allTasks: Task[]): string[] {
    // Default: previous task must complete first (sequential dependency)
    if (index > 0) {
      return [allTasks[index - 1].getId().toString()];
    }
    return [];
  }
  
  // Task context building methods
  private buildTaskContext(task: Task, step: Step): TaskContext {
    return {
      stepDescription: step.getDescription(),
      stepIndex: this.plan.getCurrentStepIndex(),
      totalSteps: this.plan.getSteps().length,
      workflowGoal: this.workflow.goal,
      currentUrl: this.session.getCurrentUrl()?.toString()
    };
  }
  
  private extractTargetConcept(task: Task, context: TaskContext): string {
    // Extract semantic target from task description
    // Example: "Click search button" -> "search button"
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
  
  private buildExpectedOutcome(task: Task, step: Step): string {
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
    // This would be enhanced based on actual Task entity structure
    return (task as any).inputData || undefined;
  }
  
  private defineAcceptableOutcomes(task: Task, context: TaskContext): string[] {
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
  
  private defineRequiredEvidence(intent: Intent): string[] {
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
  
  private defineOptionalEvidence(intent: Intent): string[] {
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
  
  private allowsPartialSuccess(task: Task, step: Step): boolean {
    // Allow partial success for non-critical extraction tasks
    const intent = task.getIntent().toString();
    const priority = this.getPriorityValue(task.getPriority());
    
    return intent === 'Extract' && priority < 7;
  }
  
  private async executeReadyTasks(tasks: StrategicTask[]): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    
    // **NEW REQUIREMENT**: Implement true parallel execution for independent tasks
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
      
      // **NEW REQUIREMENT**: Enhanced dependency checking with detailed errors
      if (!this.taskQueue.areDependenciesMet(strategicTask)) {
        const unmeetDeps = this.taskQueue.getUnmetDependencies(strategicTask);
        const errorContext = this.buildDependencyErrorContext(strategicTask, unmeetDeps);
        this.taskQueue.markBlocked(strategicTask);
        
        // Log detailed dependency failure
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
  
  // Enhanced error context methods for rich error reporting
  private buildDependencyErrorContext(task: StrategicTask, unmetDeps: string[]): ErrorContext {
    const dependencyDetails = unmetDeps.map(depId => {
      const depTask = this.findTaskById(depId);
      return {
        id: depId,
        description: depTask?.getDescription() || 'Unknown task',
        status: depTask?.getStatus() || 'unknown',
        error: depTask?.getError()?.message
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
  
  private generateRecoverySuggestions(task: StrategicTask, dependencies: any[]): string[] {
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
  
  // **NEW REQUIREMENT**: Async task execution method for parallel processing
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
}
```

#### 1.2 Update WorkflowManager Integration

**File**: `src/core/services/workflow-manager.ts`

First, update the WorkflowManagerConfig interface:

```typescript
export interface WorkflowManagerConfig {
  // ... existing config fields
  // Phase 1: TaskQueue Integration
  taskQueue?: TaskQueue;
  enableQueueIntegration?: boolean;
  // Phase 2: StateManager Integration  
  stateManager?: StateManager;
  enableStateIntegration?: boolean;
  // Phase 3: WorkflowMonitor Integration
  workflowMonitor?: WorkflowMonitor;
  enableMonitorIntegration?: boolean;
}
```

Then update the WorkflowManager class:

```typescript
export class WorkflowManager {
  private taskQueue: TaskQueue;
  
  constructor(/* existing params */, config: WorkflowManagerConfig) {
    // ... existing initialization
    this.taskQueue = config.taskQueue || new TaskQueue();
    
    // **NEW**: Setup TaskQueue event listeners for enhanced monitoring
    if (config.enableQueueIntegration !== false) {
      this.setupTaskQueueEventListeners();
    }
  }
  
  // **CRITICAL**: Update workflow aggregate creation to pass TaskQueue and reporter
  private createWorkflowAggregate(
    workflow: Workflow,
    plan: Plan,
    session: Session
  ): Result<WorkflowAggregate> {
    return WorkflowAggregate.create(
      workflow,
      plan,
      session,
      this.taskQueue,  // Pass TaskQueue instance
      this.reporter    // Pass reporter for logging
    );
  }
  
  // **NEW**: Setup TaskQueue event listeners for monitoring integration
  private setupTaskQueueEventListeners(): void {
    // Listen to task queue events and bridge them to the event bus
    this.taskQueue.on('task:enqueued', (data: any) => {
      this.reporter.log(`📥 Task enqueued: ${data.task.name} (Queue: ${data.queueSize}, Ready: ${data.readyCount}, Blocked: ${data.blockedCount})`);
      this.eventBus.emit('queue:task-added', data);
    });

    this.taskQueue.on('task:dequeued', (data: any) => {
      this.reporter.log(`📤 Task dequeued: ${data.task.name} (Remaining: ${data.remainingSize})`);
      this.eventBus.emit('queue:task-removed', data);
    });

    this.taskQueue.on('task:completed', (data: any) => {
      this.reporter.log(`✅ Task completed in queue: ${data.taskId} (Total completed: ${data.completedCount})`);
      this.eventBus.emit('queue:task-completed', data);
    });

    this.taskQueue.on('task:failed', (data: any) => {
      this.reporter.log(`❌ Task failed in queue: ${data.taskId} - ${data.error}`);
      this.eventBus.emit('queue:task-failed', data);
    });

    this.taskQueue.on('task:blocked', (data: any) => {
      this.reporter.log(`🚫 Task blocked: ${data.task.name} (Dependencies: ${data.unmetDependencies.join(', ')})`);
      this.eventBus.emit('queue:task-blocked', data);
    });

    this.taskQueue.on('queue:optimized', (data: any) => {
      this.reporter.log(`🔧 Queue optimized: ${data.queueSize} total, ${data.priorityTasks} priority tasks`);
      this.eventBus.emit('queue:optimized', data);
    });

    this.taskQueue.on('queue:cleanup', (data: any) => {
      this.reporter.log(`🧹 Queue cleanup: removed ${data.removedCount} old completed tasks, ${data.remainingCount} remaining`);
      this.eventBus.emit('queue:cleanup', data);
    });
  }
  
  // Enhanced execution with queue metrics and optimization
  async executeWorkflow(goal: string, startUrl?: string): Promise<WorkflowResult> {
    // ... existing setup
    
    // **NEW**: Clear queue for new workflow execution
    this.taskQueue.clear();
    this.reporter.log(`📊 TaskQueue cleared for new workflow execution`);
    
    // Execute with queue-based scheduling
    while (!this.currentPlan.isComplete()) {
      // **NEW**: Report queue status before step execution
      const readyTasks = this.taskQueue.getReadyTasks();
      const blockedTasks = this.taskQueue.getBlockedTasks();
      this.reporter.log(`📊 Queue Status: ${readyTasks.length} ready, ${blockedTasks.length} blocked, ${this.taskQueue.size()} total`);
      
      // **NEW**: Optimize queue if necessary
      this.taskQueue.optimizeForHighPriority();
      
      // **NEW**: Perform memory cleanup periodically
      if (this.taskQueue.size() % 50 === 0) {
        this.taskQueue.cleanupCompletedTasks();
      }
      
      // **CRITICAL**: Execute next step using queue - note async call with await
      const stepResult = await this.workflowAggregate!.executeNextStep();
      if (stepResult.isFailure()) {
        this.reporter.log(`Step execution failed: ${stepResult.getError()}`);
        break;
      }
      
      // ... rest of execution
    }
    
    // **NEW**: Final queue metrics reporting
    this.reporter.log(`📊 Final Queue Metrics: ${this.taskQueue.getAllTasks().length} total tasks processed`);
  }
}
```

#### 1.3 Type Definitions and Interfaces

**File**: `src/core/aggregates/workflow-aggregate.ts`

Add necessary type definitions at the top of the file:

```typescript
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
```

#### 1.4 Critical Implementation Considerations

**IMPORTANT**: These considerations address type safety and compatibility issues that must be handled during implementation:

1. **Value Object Compatibility**:
   - Priority value objects may have different APIs (`.isHigh()`, `.getValue()`, `.value`)
   - Intent value objects need proper string conversion and mapping
   - Implement defensive checks for different value object patterns

2. **Type Mapping Requirements**:
   - Intent types between Task entities and StrategicTask may differ
   - Implement comprehensive mapping functions with fallbacks
   - Ensure all enum values are properly handled

3. **Error Context Requirements**:
   - All errors must include rich context with recovery suggestions
   - Dependency failures need detailed tracking and reporting
   - Promise rejections require specific handling in parallel execution

4. **Factory Pattern Integration**:
   - AgentFactory must be updated to create fully integrated WorkflowManager
   - Configuration options must support feature toggles
   - Backward compatibility must be maintained

#### 1.5 Phase 1 Updated Requirements Summary

**Critical Additions to Original Plan:**

1. **Event System Integration**
   - TaskQueue must extend EventEmitter
   - Emit events for: task:enqueued, task:dequeued, task:completed, task:failed, task:blocked, queue:optimized, queue:cleanup
   - Events must include contextual data for monitoring
   - Bridge all TaskQueue events to the system EventBus

2. **True Parallel Execution Capability**
   - Implement `executeTaskAsync()` method for individual task async execution
   - Group tasks by dependency levels (independent vs dependent)
   - Execute independent tasks concurrently using `Promise.allSettled()`
   - Handle both fulfilled and rejected promises gracefully
   - Update executeReadyTasks to return Promise<TaskResult[]>

3. **Enhanced Error Handling & Monitoring**
   - Add `getUnmetDependencies()` method to TaskQueue
   - Add `markFailed()` and `markBlocked()` methods with event emission
   - Provide specific dependency context in error messages  
   - Detailed logging for blocked tasks with dependency details
   - Comprehensive error handling in parallel execution

4. **Performance & Memory Optimizations**
   - High-priority task fast-tracking when queue size > 10
   - Memory management via `cleanupCompletedTasks()` method
   - Periodic cleanup during workflow execution (every 50 tasks)
   - Queue performance monitoring and optimization
   - Final metrics reporting after workflow completion

5. **Enhanced Monitoring & Observability**
   - Real-time queue status reporting in execution loop
   - Comprehensive event listeners in WorkflowManager
   - Event bridging to system EventBus for cross-system monitoring
   - Queue metrics logging and cleanup notifications

**Updated Success Criteria:**
- ✅ TaskQueue integrated with DDD aggregates (with optional parameter)
- ✅ Complete event system implemented with 7 event types
- ✅ True parallel execution capability using Promise.allSettled
- ✅ Enhanced error reporting with dependency details and blocked task tracking
- ✅ Performance optimizations and memory management in place
- ✅ Comprehensive monitoring and observability features
- ✅ Backward compatibility maintained (TaskQueue parameter optional)
- ✅ Event bridging to system EventBus for cross-component integration
- ✅ Comprehensive task conversion with all StrategicTask fields
- ✅ Rich error context with recovery suggestions
- ✅ Configuration interface with feature toggles

#### 1.5 Phase 1 Testing Strategy

**Unit Tests Required:**

```typescript
// test/core/services/task-queue.test.ts
describe('TaskQueue Enhanced Features', () => {
  it('should emit events for all queue operations');
  it('should track unmet dependencies correctly');
  it('should handle memory cleanup after 100 completed tasks');
  it('should optimize for high-priority tasks when queue > 10');
  it('should mark tasks as failed with error context');
  it('should mark tasks as blocked with dependency details');
});

// test/core/aggregates/workflow-aggregate.test.ts
describe('WorkflowAggregate TaskQueue Integration', () => {
  it('should execute independent tasks in parallel');
  it('should respect task dependencies in execution order');
  it('should handle Promise.allSettled rejections gracefully');
  it('should convert Task entities to StrategicTask correctly');
  it('should provide rich error context for failures');
  it('should report queue status in execution status');
});

// test/core/services/workflow-manager.test.ts
describe('WorkflowManager Queue Integration', () => {
  it('should bridge all TaskQueue events to EventBus');
  it('should report queue metrics during execution');
  it('should perform periodic memory cleanup');
  it('should clear queue at workflow start');
  it('should pass TaskQueue to WorkflowAggregate');
});
```

**Integration Test Example:**

```typescript
it('should execute workflow with parallel task execution', async () => {
  const config: WorkflowManagerConfig = {
    enableQueueIntegration: true,
    taskQueue: new TaskQueue()
  };
  
  const manager = new WorkflowManager(/* deps */, config);
  const result = await manager.executeWorkflow('Search and extract data');
  
  // Verify parallel execution occurred
  expect(mockExecutor.calls).toContainParallelExecution();
  // Verify queue events were emitted
  expect(eventBus.events).toContainQueueEvents();
  // Verify final metrics
  expect(result.queueMetrics).toBeDefined();
});

### Phase 2: Enhanced StateManager Integration with Aggregates
**Duration**: 2 days | **Priority**: High | **Risk**: Low

#### 2.1 Connect StateManager to ExecutionAggregate

**File**: `src/core/aggregates/execution-aggregate.ts`

```typescript
export class ExecutionAggregate {
  private stateManager?: StateManager;
  
  // Add StateManager injection
  setStateManager(stateManager: StateManager): void {
    this.stateManager = stateManager;
  }
  
  // Enhanced execution recording with state context
  recordExecution(
    task: Task, 
    result: TaskResult, 
    evidence?: Evidence,
    context?: string
  ): Result<ExecutionResult> {
    // Capture current state
    const currentState = this.stateManager?.getCurrentState();
    
    // Create checkpoint before recording
    if (this.stateManager && result.success) {
      this.stateManager.createCheckpoint(`task-${task.getId()}-complete`);
    }
    
    // Enhanced execution result with state context
    const executionResult = ExecutionResult.create(
      task.getId(),
      result,
      evidence,
      context || this.buildContextFromState(currentState),
      task.getRetryCount()
    );
    
    // Update execution context with new state
    if (this.stateManager) {
      const newState = await this.stateManager.captureState();
      this.context.updatePageState(newState);
      
      // Detect significant state changes
      if (currentState && this.stateManager.hasStateChanged(currentState, newState)) {
        this.context.recordStateChange(currentState, newState);
      }
    }
    
    this.results.push(executionResult.getValue());
    return executionResult;
  }
  
  // Rollback support using checkpoints
  rollbackToCheckpoint(checkpointName: string): Result<void> {
    if (!this.stateManager) {
      return Result.fail('StateManager not available for rollback');
    }
    
    const checkpoint = this.stateManager.getCheckpoint(checkpointName);
    if (!checkpoint) {
      return Result.fail(`Checkpoint ${checkpointName} not found`);
    }
    
    // Restore state from checkpoint
    // This would involve navigating back to the checkpoint URL
    // and restoring extracted data
    
    return Result.ok();
  }
}
```

#### 2.2 Add State-Aware Replanning

**File**: `src/core/services/workflow-manager.ts`

```typescript
private async checkForReplanning(): Promise<boolean> {
  if (!this.stateManager) return false;
  
  const currentState = this.stateManager.getCurrentState();
  const previousState = this.stateManager.getPreviousState();
  
  if (!currentState || !previousState) return false;
  
  // Check if state changed significantly
  if (this.stateManager.hasStateChanged(previousState, currentState)) {
    // Analyze what changed
    const changes = this.analyzeStateChanges(previousState, currentState);
    
    if (changes.requiresReplanning) {
      this.reporter.log('🔄 Significant state change detected, triggering replanning');
      
      // Create checkpoint before replanning
      this.stateManager.createCheckpoint('before-replan');
      
      // Trigger replanning with state context
      const newPlan = await this.replanWithStateContext(currentState);
      
      if (newPlan) {
        this.currentPlan = newPlan;
        this.eventBus.emit('replan:triggered', {
          reason: changes.reason,
          newPlanSize: newPlan.getSteps().length
        });
        return true;
      }
    }
  }
  
  return false;
}

private analyzeStateChanges(prev: PageState, curr: PageState): StateChangeAnalysis {
  const prevSections = new Set(prev.visibleSections);
  const currSections = new Set(curr.visibleSections);
  const prevActions = new Set(prev.availableActions);
  const currActions = new Set(curr.availableActions);
  
  // Calculate differences
  const sectionChanges = this.calculateSetDifference(prevSections, currSections);
  const actionChanges = this.calculateSetDifference(prevActions, currActions);
  
  return {
    requiresReplanning: sectionChanges > 0.5 || actionChanges > 0.5,
    reason: `Sections changed ${(sectionChanges * 100).toFixed(0)}%, Actions changed ${(actionChanges * 100).toFixed(0)}%`
  };
}
```

### Phase 3: WorkflowMonitor Domain Event Integration
**Duration**: 1-2 days | **Priority**: Medium | **Risk**: Low

#### 3.1 Bridge Domain Events to Monitor

**File**: `src/core/services/workflow-manager.ts`

```typescript
private connectDomainEventsToMonitor(): void {
  // TaskQueue events
  this.taskQueue.on('task:enqueued', (task: StrategicTask) => {
    this.eventBus.emit('queue:task-added', {
      task,
      queueSize: this.taskQueue.size(),
      readyCount: this.taskQueue.getReadyTasks().length,
      blockedCount: this.taskQueue.getBlockedTasks().length
    });
  });
  
  this.taskQueue.on('task:dequeued', (task: StrategicTask) => {
    this.eventBus.emit('queue:task-removed', {
      task,
      remainingSize: this.taskQueue.size()
    });
  });
  
  this.taskQueue.on('task:blocked', (task: StrategicTask) => {
    this.eventBus.emit('queue:task-blocked', {
      task,
      dependencies: task.dependencies,
      blockedCount: this.taskQueue.getBlockedTasks().length
    });
  });
  
  // StateManager events
  this.stateManager.on('state:captured', (state: PageState) => {
    this.eventBus.emit('state:captured', {
      url: state.url,
      sectionsCount: state.visibleSections.length,
      actionsCount: state.availableActions.length,
      timestamp: new Date()
    });
  });
  
  this.stateManager.on('checkpoint:created', (name: string) => {
    this.eventBus.emit('state:checkpoint', {
      name,
      checkpointCount: this.stateManager.getCheckpointNames().length,
      timestamp: new Date()
    });
  });
  
  this.stateManager.on('data:extracted', (data: Record<string, any>) => {
    this.eventBus.emit('state:data-extracted', {
      keys: Object.keys(data),
      itemCount: Object.keys(data).length,
      timestamp: new Date()
    });
  });
  
  // Domain entity events (if using domain events from Phase 6)
  if (this.workflow) {
    this.workflow.on(WorkflowStartedEvent, (event: WorkflowStartedEvent) => {
      this.eventBus.emit('workflow:started', {
        goal: event.goal,
        workflowId: event.workflowId.toString(),
        timestamp: event.occurredAt
      });
    });
    
    this.workflow.on(TaskCompletedEvent, (event: TaskCompletedEvent) => {
      this.eventBus.emit('task:completed', {
        taskId: event.taskId.toString(),
        result: event.result,
        timestamp: event.occurredAt
      });
    });
  }
}
```

#### 3.2 Enhance WorkflowMonitor with New Metrics

**File**: `src/core/services/workflow-monitor.ts`

```typescript
export class WorkflowMonitor {
  private queueMetrics: QueueMetrics = {
    totalEnqueued: 0,
    totalDequeued: 0,
    totalBlocked: 0,
    maxQueueSize: 0,
    averageWaitTime: 0
  };
  
  private stateMetrics: StateMetrics = {
    totalStateCaptures: 0,
    totalCheckpoints: 0,
    totalDataExtractions: 0,
    stateChangeFrequency: 0
  };
  
  private setupListeners(): void {
    // ... existing listeners
    
    // Queue event listeners
    this.eventBus.on('queue:task-added', this.onTaskEnqueued.bind(this));
    this.eventBus.on('queue:task-removed', this.onTaskDequeued.bind(this));
    this.eventBus.on('queue:task-blocked', this.onTaskBlocked.bind(this));
    
    // State event listeners
    this.eventBus.on('state:captured', this.onStateCapture.bind(this));
    this.eventBus.on('state:checkpoint', this.onCheckpointCreated.bind(this));
    this.eventBus.on('state:data-extracted', this.onDataExtracted.bind(this));
  }
  
  private onTaskEnqueued(event: QueueEvent): void {
    this.queueMetrics.totalEnqueued++;
    this.queueMetrics.maxQueueSize = Math.max(
      this.queueMetrics.maxQueueSize,
      event.queueSize
    );
    
    this.reporter.log(`📥 Task enqueued: ${event.task.name} (Queue: ${event.queueSize}, Ready: ${event.readyCount}, Blocked: ${event.blockedCount})`);
  }
  
  private onTaskBlocked(event: BlockedTaskEvent): void {
    this.queueMetrics.totalBlocked++;
    
    this.reporter.log(`🚫 Task blocked: ${event.task.name} (Dependencies: ${event.dependencies.join(', ')})`);
  }
  
  private onStateCapture(event: StateEvent): void {
    this.stateMetrics.totalStateCaptures++;
    
    this.reporter.log(`📸 State captured: ${event.url} (Sections: ${event.sectionsCount}, Actions: ${event.actionsCount})`);
  }
  
  private onCheckpointCreated(event: CheckpointEvent): void {
    this.stateMetrics.totalCheckpoints++;
    
    this.reporter.log(`💾 Checkpoint created: ${event.name} (Total: ${event.checkpointCount})`);
  }
  
  // Enhanced metrics reporting
  logMetrics(): void {
    // ... existing metrics
    
    this.reporter.log(`\n📊 Queue Metrics:`);
    this.reporter.log(`   • Total Enqueued: ${this.queueMetrics.totalEnqueued}`);
    this.reporter.log(`   • Total Dequeued: ${this.queueMetrics.totalDequeued}`);
    this.reporter.log(`   • Total Blocked: ${this.queueMetrics.totalBlocked}`);
    this.reporter.log(`   • Max Queue Size: ${this.queueMetrics.maxQueueSize}`);
    
    this.reporter.log(`\n📊 State Metrics:`);
    this.reporter.log(`   • State Captures: ${this.stateMetrics.totalStateCaptures}`);
    this.reporter.log(`   • Checkpoints: ${this.stateMetrics.totalCheckpoints}`);
    this.reporter.log(`   • Data Extractions: ${this.stateMetrics.totalDataExtractions}`);
  }
}
```

### Phase 4: Domain Service Enhancement
**Duration**: 2 days | **Priority**: Medium | **Risk**: Low

#### 4.1 ExecutionService with TaskQueue

**File**: `src/core/domain-services/execution-service.ts`

```typescript
export interface ExecutionService {
  executeTask(
    task: Task,
    context: ExecutionContext,
    queue?: TaskQueue
  ): Promise<Result<TaskResult>>;
  
  executeStep(
    step: Step,
    context: ExecutionContext,
    queue?: TaskQueue
  ): Promise<Result<StepResult>>;
}

export class BrowserExecutionService implements ExecutionService {
  async executeTask(
    task: Task,
    context: ExecutionContext,
    queue?: TaskQueue
  ): Promise<Result<TaskResult>> {
    // Check queue dependencies if available
    if (queue) {
      const strategicTask = this.convertToStrategicTask(task);
      
      if (!queue.areDependenciesMet(strategicTask)) {
        return Result.fail(`Task ${task.getId()} has unmet dependencies`);
      }
      
      // Priority handling
      const priority = task.getPriority();
      if (priority.isHigh() && queue.size() > 10) {
        // Fast-track high priority tasks
        await this.optimizeForHighPriority(task);
      }
    }
    
    // Execute task
    const result = await this.performExecution(task, context);
    
    // Mark completed in queue
    if (queue && result.isSuccess()) {
      queue.markCompleted(task.getId().toString());
    }
    
    return result;
  }
  
  async executeStep(
    step: Step,
    context: ExecutionContext,
    queue?: TaskQueue
  ): Promise<Result<StepResult>> {
    const tasks = step.getTasks();
    
    if (queue) {
      // Enqueue all tasks with dependencies
      tasks.forEach((task, index) => {
        const strategicTask = this.convertToStrategicTask(task);
        strategicTask.dependencies = index > 0 ? [tasks[index - 1].getId().toString()] : [];
        
        if (task.getPriority().isHigh()) {
          queue.enqueuePriority(strategicTask);
        } else {
          queue.enqueue(strategicTask);
        }
      });
      
      // Execute ready tasks potentially in parallel
      return this.executeWithQueue(step, context, queue);
    }
    
    // Fallback to sequential execution
    return this.executeSequentially(step, context);
  }
}
```

#### 4.2 PlanningService with StateManager

**File**: `src/core/domain-services/planning-service.ts`

```typescript
export interface PlanningService {
  createPlan(
    goal: string,
    context: PlanningContext,
    stateManager?: StateManager
  ): Promise<Result<Plan>>;
  
  refinePlan(
    plan: Plan,
    feedback: EvaluationFeedback,
    stateManager?: StateManager
  ): Promise<Result<Plan>>;
}

export class AITaskPlanningService implements PlanningService {
  async createPlan(
    goal: string,
    context: PlanningContext,
    stateManager?: StateManager
  ): Promise<Result<Plan>> {
    // Enhance context with state information
    if (stateManager) {
      const currentState = stateManager.getCurrentState();
      const extractedData = stateManager.getAllExtractedData();
      
      context = {
        ...context,
        currentUrl: currentState?.url,
        availableActions: currentState?.availableActions || [],
        visibleSections: currentState?.visibleSections || [],
        extractedData,
        checkpoints: stateManager.getCheckpointNames()
      };
    }
    
    // Generate plan with enhanced context
    const plan = await this.generatePlanWithContext(goal, context);
    
    return plan;
  }
  
  async refinePlan(
    plan: Plan,
    feedback: EvaluationFeedback,
    stateManager?: StateManager
  ): Promise<Result<Plan>> {
    if (!stateManager) {
      return this.basicRefinePlan(plan, feedback);
    }
    
    // Use state insights for intelligent replanning
    const currentState = stateManager.getCurrentState();
    const previousState = stateManager.getPreviousState();
    
    // Analyze state transitions
    const stateTransition = this.analyzeStateTransition(previousState, currentState);
    
    // Check if we can use a checkpoint for recovery
    const checkpoints = stateManager.getCheckpointNames();
    const recoveryPoint = this.findBestRecoveryPoint(checkpoints, feedback);
    
    // Create refined plan based on state analysis
    const refinedPlan = await this.createAdaptivePlan(
      plan,
      feedback,
      stateTransition,
      recoveryPoint
    );
    
    return refinedPlan;
  }
}
```

### Phase 5: Factory and Initialization Updates
**Duration**: 1 day | **Priority**: High | **Risk**: Low

#### 5.1 Update AgentFactory

**File**: `src/core/factories/agent-factory.ts`

```typescript
export class AgentFactory {
  static createWorkflowManagerWithFullIntegration(
    config: MultiAgentConfig,
    infrastructure: AgentInfrastructure,
    options: {
      enableDomainServices?: boolean;
      enableRepositories?: boolean;
      enableQueueIntegration?: boolean;
      enableStateIntegration?: boolean;
      enableMonitorIntegration?: boolean;
    } = {}
  ): WorkflowManager {
    // Create core services
    const taskQueue = options.enableQueueIntegration ? new TaskQueue() : undefined;
    const stateManager = options.enableStateIntegration ? 
      new StateManager(infrastructure.browser, infrastructure.domService) : undefined;
    const workflowMonitor = options.enableMonitorIntegration ?
      new WorkflowMonitor(infrastructure.eventBus, infrastructure.reporter) : undefined;
    
    // Create workflow manager with all integrations
    const workflowConfig: WorkflowManagerConfig = {
      ...config,
      taskQueue,
      stateManager,
      workflowMonitor
    };
    
    // Add domain services if enabled
    if (options.enableDomainServices) {
      const domainServices = this.createDomainServicesWithIntegration(
        infrastructure,
        taskQueue,
        stateManager
      );
      workflowConfig.planningService = domainServices.planningService;
      workflowConfig.executionService = domainServices.executionService;
      workflowConfig.evaluationService = domainServices.evaluationService;
    }
    
    // Add repositories if enabled
    if (options.enableRepositories) {
      const repositories = this.createRepositories();
      workflowConfig.workflowRepository = repositories.workflowRepository;
      workflowConfig.planRepository = repositories.planRepository;
      workflowConfig.memoryRepository = repositories.memoryRepository;
    }
    
    return new WorkflowManager(
      // ... existing params
      workflowConfig
    );
  }
  
  private static createDomainServicesWithIntegration(
    infrastructure: AgentInfrastructure,
    taskQueue?: TaskQueue,
    stateManager?: StateManager
  ) {
    return {
      planningService: new AITaskPlanningService(
        infrastructure.llm,
        new MemoryService(),
        stateManager
      ),
      executionService: new BrowserExecutionService(
        infrastructure.browser,
        infrastructure.domService,
        taskQueue
      ),
      evaluationService: new AIEvaluationService(
        infrastructure.llm,
        new ScreenshotService(),
        stateManager
      )
    };
  }
}
```

#### 5.2 Update init-multi-agent.ts

**File**: `src/init-multi-agent.ts`

```typescript
export function initMultiAgent(config: InitMultiAgentConfig): WorkflowManager {
  // Initialize infrastructure components
  const infrastructure = initializeInfrastructure(config);
  
  // Create workflow manager with full integration
  const workflowManager = AgentFactory.createWorkflowManagerWithFullIntegration(
    config,
    infrastructure,
    {
      enableDomainServices: config.enableDomainServices ?? true,
      enableRepositories: config.enableRepositories ?? true,
      enableQueueIntegration: config.enableQueueIntegration ?? true,
      enableStateIntegration: config.enableStateIntegration ?? true,
      enableMonitorIntegration: config.enableMonitorIntegration ?? true
    }
  );
  
  if (config.verbose) {
    infrastructure.reporter.info('🏗️ Multi-agent system initialized with full DDD integration');
    infrastructure.reporter.info('✅ TaskQueue: Enabled for dependency resolution');
    infrastructure.reporter.info('✅ StateManager: Enabled for state tracking and checkpoints');
    infrastructure.reporter.info('✅ WorkflowMonitor: Enabled for comprehensive metrics');
  }
  
  return workflowManager;
}
```

## Testing Strategy

### Unit Tests

1. **TaskQueue Integration Tests**
   - Test priority queuing with Task entities
   - Test dependency resolution with Plan structure
   - Test parallel task identification

2. **StateManager Integration Tests**
   - Test checkpoint creation and recovery
   - Test state change detection
   - Test data extraction persistence

3. **WorkflowMonitor Integration Tests**
   - Test domain event bridging
   - Test queue metrics collection
   - Test state metrics tracking

### Integration Tests

1. **End-to-End Workflow Tests**
   - Test complete workflow with queue-based execution
   - Test state-aware replanning
   - Test checkpoint recovery after failure

2. **Performance Tests**
   - Benchmark queue performance with large task graphs
   - Measure state capture overhead
   - Monitor event processing performance

## Migration Strategy

### Step 1: Enable Feature Flags (Day 1)
- Add configuration flags for each integration
- Default to disabled for backward compatibility
- Enable selectively for testing

### Step 2: Implement Core Integrations (Days 2-5)
- Phase 1: TaskQueue integration
- Phase 2: StateManager enhancement
- Phase 3: WorkflowMonitor bridging

### Step 3: Test and Validate (Days 6-7)
- Run comprehensive test suite
- Performance benchmarking
- Fix any integration issues

### Step 4: Gradual Rollout (Week 2)
- Enable features one by one in production
- Monitor metrics and performance
- Gather feedback and iterate

### Step 5: Full Integration (Week 3)
- Enable all features by default
- Remove feature flags
- Document new capabilities

## Success Metrics

### Performance Metrics
- **Task Execution Efficiency**: Measure parallel vs sequential execution time
- **Queue Throughput**: Tasks processed per minute
- **State Capture Overhead**: Time added by state management
- **Memory Usage**: Impact of checkpoints and state history

### Quality Metrics
- **Workflow Success Rate**: Improvement with checkpoint recovery
- **Replanning Accuracy**: Success rate after state-aware replanning
- **Dependency Resolution**: Correctly ordered task execution
- **Error Recovery**: Successful recovery from failures

### Observability Metrics
- **Event Coverage**: Percentage of domain events monitored
- **Metric Completeness**: All key metrics being tracked
- **Debug Information**: Quality of logging and debugging data
- **Alert Accuracy**: Relevant alerts from monitoring

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance degradation from state capture | High | Implement async state capture, configurable frequency |
| Memory growth from checkpoints | Medium | Limit checkpoint history, implement cleanup |
| Queue complexity with large graphs | Medium | Optimize dependency resolution algorithm |
| Breaking existing workflows | High | Feature flags, backward compatibility |
| Event storm from monitoring | Low | Event batching, sampling for high-frequency events |

## Conclusion

This integration plan transforms three underutilized service classes into core components of the DDD architecture:

1. **TaskQueue** becomes the intelligent task scheduler, enabling dependency resolution and priority-based execution
2. **StateManager** provides resilience through checkpoints and enables state-aware decision making
3. **WorkflowMonitor** offers comprehensive observability across all domain operations

The integration maintains backward compatibility while significantly enhancing the system's capabilities in terms of performance, resilience, and observability. The phased approach ensures minimal disruption while delivering incremental value at each stage.