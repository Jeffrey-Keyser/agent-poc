import { EnhancedEventBusInterface } from '../interfaces/event-bus.interface';
import { AgentReporter } from '../interfaces/agent-reporter.interface';
import { StrategicTask, StepResult, WorkflowResult } from '../types/agent-types';

export interface WorkflowEvent {
  goal?: string;
  plan?: { tasks: StrategicTask[] };
  error?: string;
  timestamp: Date;
}

export interface TaskEvent {
  task: StrategicTask;
  result?: StepResult;
  duration?: number;
  microActions?: any[];
  timestamp: Date;
}

export interface StepEvent {
  step: StrategicTask;
  result?: StepResult;
  microActions?: any[];
  timestamp: Date;
}

export interface QueueEvent {
  task: StrategicTask;
  queueSize: number;
  readyCount: number;
  blockedCount: number;
  timestamp?: Date;
}

export interface BlockedTaskEvent {
  task: StrategicTask;
  dependencies: string[];
  unmetDependencies: string[];
  blockedCount: number;
  timestamp?: Date;
}

export interface StateEvent {
  url: string;
  sectionsCount: number;
  actionsCount: number;
  timestamp: Date;
}

export interface CheckpointEvent {
  name: string;
  checkpointCount: number;
  timestamp: Date;
}

export interface DataExtractionEvent {
  keys: string[];
  itemCount: number;
  timestamp: Date;
}

export class WorkflowMonitor {
  private metrics: WorkflowMetrics = {
    totalWorkflows: 0,
    successfulWorkflows: 0,
    failedWorkflows: 0,
    averageWorkflowDuration: 0,
    totalSteps: 0,
    successfulSteps: 0,
    failedSteps: 0,
    averageStepDuration: 0,
    replanCount: 0,
    errorCount: 0
  };
  
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

  private currentWorkflowStart: Date | null = null;

  constructor(
    private eventBus: EnhancedEventBusInterface,
    private reporter: AgentReporter
  ) {
    this.setupListeners();
  }

  private setupListeners(): void {
    // ... existing listeners
    this.eventBus.on('workflow:started', this.onWorkflowStart.bind(this));
    this.eventBus.on('workflow:planning', this.onWorkflowPlanning.bind(this));
    this.eventBus.on('workflow:completed', this.onWorkflowComplete.bind(this));
    this.eventBus.on('workflow:error', this.onWorkflowError.bind(this));
    this.eventBus.on('step:started', this.onStepStart.bind(this));
    this.eventBus.on('step:completed', this.onStepComplete.bind(this));
    this.eventBus.on('step:failed', this.onStepFailed.bind(this));
    this.eventBus.on('task:started', this.onTaskStart.bind(this));
    this.eventBus.on('task:completed', this.onTaskComplete.bind(this));
    this.eventBus.on('task:failed', this.onTaskFailed.bind(this));
    this.eventBus.on('replan:triggered', this.onReplanTriggered.bind(this));
    
    this.eventBus.on('queue:task-added', this.onTaskEnqueued.bind(this));
    this.eventBus.on('queue:task-removed', this.onTaskDequeued.bind(this));
    this.eventBus.on('queue:task-blocked', this.onTaskBlocked.bind(this));
    this.eventBus.on('queue:task-completed', this.onQueueTaskCompleted.bind(this));
    this.eventBus.on('queue:task-failed', this.onQueueTaskFailed.bind(this));
    this.eventBus.on('queue:optimized', this.onQueueOptimized.bind(this));
    this.eventBus.on('queue:cleanup', this.onQueueCleanup.bind(this));
    
    this.eventBus.on('state:captured', this.onStateCapture.bind(this));
    this.eventBus.on('state:checkpoint', this.onCheckpointCreated.bind(this));
    this.eventBus.on('state:data-extracted', this.onDataExtracted.bind(this));
  }

  private onWorkflowStart(event: WorkflowEvent): void {
    this.currentWorkflowStart = new Date();
    this.metrics.totalWorkflows++;
    
    this.reporter.log(`🚀 Workflow started: ${event.goal}`);
    this.reporter.log(`📊 Total workflows initiated: ${this.metrics.totalWorkflows}`);
  }

  private onWorkflowPlanning(event: WorkflowEvent): void {
    if (event.plan) {
      this.reporter.log(`📋 Strategic plan created with ${event.plan.tasks.length} steps`);
    }
  }

  private onWorkflowComplete(event: { result: WorkflowResult }): void {
    const duration = this.currentWorkflowStart ? 
      Date.now() - this.currentWorkflowStart.getTime() : 0;

    if (event.result.status === 'success') {
      this.metrics.successfulWorkflows++;
      this.reporter.log(`🎉 Workflow completed successfully in ${this.formatDuration(duration)}`);
    } else {
      this.reporter.log(`⚠️ Workflow completed with issues in ${this.formatDuration(duration)}`);
    }

    this.updateAverageWorkflowDuration(duration);
    this.logWorkflowSummary(event.result);
  }

  private onWorkflowError(event: WorkflowEvent): void {
    this.metrics.failedWorkflows++;
    this.metrics.errorCount++;
    
    this.reporter.log(`💥 Workflow failed: ${event.error}`);
  }

  private onStepStart(event: StepEvent): void {
    this.reporter.log(`⚡ Executing step: ${event.step.description}`);
  }

  private onStepComplete(event: StepEvent): void {
    this.metrics.totalSteps++;
    
    if (event.result?.status === 'success') {
      this.metrics.successfulSteps++;
      const duration = event.result.duration || 0;
      this.reporter.log(`✅ Step completed: ${event.step.description} (${this.formatDuration(duration)})`);
      
      if (event.microActions && event.microActions.length > 0) {
        this.reporter.log(`🔧 Executed ${event.microActions.length} micro-actions`);
      }
      
      this.updateAverageStepDuration(duration);
    }
  }

  private onStepFailed(event: StepEvent): void {
    this.metrics.totalSteps++;
    this.metrics.failedSteps++;
    this.metrics.errorCount++;
    
    const duration = event.result?.duration || 0;
    this.reporter.log(`❌ Step failed: ${event.step.description} (${this.formatDuration(duration)})`);
    
    if (event.result?.errorReason) {
      this.reporter.log(`💡 Reason: ${event.result.errorReason}`);
    }
  }

  private onTaskStart(event: TaskEvent): void {
    this.reporter.log(`🔄 Starting task execution: ${event.task.description}`);
  }

  private onTaskComplete(event: TaskEvent): void {
    const status = event.result?.status === 'success' ? '✅' : '❌';
    const duration = event.result?.duration ? this.formatDuration(event.result.duration) : 'unknown';
    
    this.reporter.log(`${status} Task: ${event.task.description} (${duration})`);
  }

  private onTaskFailed(event: TaskEvent): void {
    this.metrics.errorCount++;
    const duration = event.result?.duration ? this.formatDuration(event.result.duration) : 'unknown';
    
    this.reporter.log(`❌ Task failed: ${event.task.description} (${duration})`);
    if (event.result?.errorReason) {
      this.reporter.log(`💡 Failure reason: ${event.result.errorReason}`);
    }
  }

  private onReplanTriggered(event: { reason: string; newPlanSize: number }): void {
    this.metrics.replanCount++;
    
    this.reporter.log(`🔄 Replanning triggered: ${event.reason}`);
    this.reporter.log(`📋 New plan generated with ${event.newPlanSize} steps`);
  }
  
  private onTaskEnqueued(event: QueueEvent): void {
    this.queueMetrics.totalEnqueued++;
    this.queueMetrics.maxQueueSize = Math.max(
      this.queueMetrics.maxQueueSize,
      event.queueSize
    );
    
    this.reporter.log(`📥 Task enqueued: ${event.task.description} (Queue: ${event.queueSize}, Ready: ${event.readyCount}, Blocked: ${event.blockedCount})`);
  }
  
  private onTaskDequeued(event: { task: StrategicTask; remainingSize: number }): void {
    this.queueMetrics.totalDequeued++;
    
    this.reporter.log(`📤 Task dequeued: ${event.task.description} (Remaining: ${event.remainingSize})`);
  }

  private onTaskBlocked(event: BlockedTaskEvent): void {
    this.queueMetrics.totalBlocked++;
    
    this.reporter.log(`🚫 Task blocked: ${event.task.description} (Dependencies: ${event.dependencies.join(', ')})`);
  }
  
  private onQueueTaskCompleted(event: { taskId: string; completedCount: number }): void {
    this.reporter.log(`✅ Task completed in queue: ${event.taskId} (Total completed: ${event.completedCount})`);
  }
  
  private onQueueTaskFailed(event: { taskId: string; error: string }): void {
    this.reporter.log(`❌ Task failed in queue: ${event.taskId} - ${event.error}`);
  }
  
  private onQueueOptimized(event: { queueSize: number; priorityTasks: number }): void {
    this.reporter.log(`🔧 Queue optimized: ${event.queueSize} total, ${event.priorityTasks} priority tasks`);
  }
  
  private onQueueCleanup(event: { removedCount: number; remainingCount: number }): void {
    this.reporter.log(`🧹 Queue cleanup: removed ${event.removedCount} old completed tasks, ${event.remainingCount} remaining`);
  }

  private onStateCapture(event: StateEvent): void {
    this.stateMetrics.totalStateCaptures++;
    
    this.reporter.log(`📸 State captured: ${event.url} (Sections: ${event.sectionsCount}, Actions: ${event.actionsCount})`);
  }
  
  private onCheckpointCreated(event: CheckpointEvent): void {
    this.stateMetrics.totalCheckpoints++;
    
    this.reporter.log(`💾 Checkpoint created: ${event.name} (Total: ${event.checkpointCount})`);
  }
  
  private onDataExtracted(event: DataExtractionEvent): void {
    this.stateMetrics.totalDataExtractions++;
    
    this.reporter.log(`📊 Data extracted: ${event.keys.join(', ')} (${event.itemCount} items)`);
  }

  private updateAverageWorkflowDuration(duration: number): void {
    const totalCompleted = this.metrics.successfulWorkflows + this.metrics.failedWorkflows;
    if (totalCompleted > 0) {
      this.metrics.averageWorkflowDuration = 
        ((this.metrics.averageWorkflowDuration * (totalCompleted - 1)) + duration) / totalCompleted;
    }
  }

  private updateAverageStepDuration(duration: number): void {
    if (this.metrics.successfulSteps > 0) {
      this.metrics.averageStepDuration = 
        ((this.metrics.averageStepDuration * (this.metrics.successfulSteps - 1)) + duration) / this.metrics.successfulSteps;
    }
  }

  private logWorkflowSummary(result: WorkflowResult): void {
    this.reporter.log(`\n📈 Workflow Summary:`);
    this.reporter.log(`   • Goal: ${result.goal}`);
    this.reporter.log(`   • Status: ${result.status.toUpperCase()}`);
    this.reporter.log(`   • Steps completed: ${result.completedSteps.length}`);
    this.reporter.log(`   • Duration: ${this.formatDuration(result.duration)}`);
    
    if (result.extractedData && Object.keys(result.extractedData).length > 0) {
      this.reporter.log(`   • Data extracted: ${Object.keys(result.extractedData).length} items`);
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  getMetrics(): WorkflowMetrics {
    return { ...this.metrics };
  }
  
  getQueueMetrics(): QueueMetrics {
    return { ...this.queueMetrics };
  }
  
  getStateMetrics(): StateMetrics {
    return { ...this.stateMetrics };
  }
  
  // Combined metrics getter
  getAllMetrics(): { workflow: WorkflowMetrics; queue: QueueMetrics; state: StateMetrics } {
    return {
      workflow: this.getMetrics(),
      queue: this.getQueueMetrics(),
      state: this.getStateMetrics()
    };
  }

  logMetrics(): void {
    const successRate = this.metrics.totalWorkflows > 0 ? 
      (this.metrics.successfulWorkflows / this.metrics.totalWorkflows * 100) : 0;
    
    const stepSuccessRate = this.metrics.totalSteps > 0 ? 
      (this.metrics.successfulSteps / this.metrics.totalSteps * 100) : 0;

    this.reporter.log(`\n📊 Performance Metrics:`);
    this.reporter.log(`   • Workflow Success Rate: ${successRate.toFixed(1)}% (${this.metrics.successfulWorkflows}/${this.metrics.totalWorkflows})`);
    this.reporter.log(`   • Step Success Rate: ${stepSuccessRate.toFixed(1)}% (${this.metrics.successfulSteps}/${this.metrics.totalSteps})`);
    this.reporter.log(`   • Average Workflow Duration: ${this.formatDuration(this.metrics.averageWorkflowDuration)}`);
    this.reporter.log(`   • Average Step Duration: ${this.formatDuration(this.metrics.averageStepDuration)}`);
    this.reporter.log(`   • Replanning Events: ${this.metrics.replanCount}`);
    this.reporter.log(`   • Total Errors: ${this.metrics.errorCount}`);
    
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

  reset(): void {
    this.metrics = {
      totalWorkflows: 0,
      successfulWorkflows: 0,
      failedWorkflows: 0,
      averageWorkflowDuration: 0,
      totalSteps: 0,
      successfulSteps: 0,
      failedSteps: 0,
      averageStepDuration: 0,
      replanCount: 0,
      errorCount: 0
    };
    
    this.queueMetrics = {
      totalEnqueued: 0,
      totalDequeued: 0,
      totalBlocked: 0,
      maxQueueSize: 0,
      averageWaitTime: 0
    };
    
    this.stateMetrics = {
      totalStateCaptures: 0,
      totalCheckpoints: 0,
      totalDataExtractions: 0,
      stateChangeFrequency: 0
    };
    
    this.currentWorkflowStart = null;
  }
}

export interface WorkflowMetrics {
  totalWorkflows: number;
  successfulWorkflows: number;
  failedWorkflows: number;
  averageWorkflowDuration: number;
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  averageStepDuration: number;
  replanCount: number;
  errorCount: number;
}

export interface QueueMetrics {
  totalEnqueued: number;
  totalDequeued: number;
  totalBlocked: number;
  maxQueueSize: number;
  averageWaitTime: number;
}

export interface StateMetrics {
  totalStateCaptures: number;
  totalCheckpoints: number;
  totalDataExtractions: number;
  stateChangeFrequency: number;
}