/**
 * Workflow Metrics Event Handler
 * 
 * This handler collects metrics and analytics from workflow domain events.
 * It tracks workflow performance, success rates, task completion times, and other
 * key performance indicators.
 */

import { 
  BaseEventHandler, 
  DomainEvent,
  WorkflowStartedEvent,
  WorkflowCompletedEvent,
  WorkflowFailedEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskRetriedEvent,
  EventTypes
} from '../../core/domain-events';

export interface WorkflowMetrics {
  totalWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  averageWorkflowDuration: number;
  workflowSuccessRate: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  retriedTasks: number;
  averageTaskDuration: number;
  taskSuccessRate: number;
  lastUpdated: Date;
}

/**
 * Event handler that collects workflow and task metrics
 */
export class WorkflowMetricsHandler extends BaseEventHandler {
  protected eventTypes = [
    EventTypes.WORKFLOW_STARTED,
    EventTypes.WORKFLOW_COMPLETED,
    EventTypes.WORKFLOW_FAILED,
    EventTypes.TASK_STARTED,
    EventTypes.TASK_COMPLETED,
    EventTypes.TASK_FAILED,
    EventTypes.TASK_RETRIED
  ];

  private metrics: WorkflowMetrics = {
    totalWorkflows: 0,
    completedWorkflows: 0,
    failedWorkflows: 0,
    averageWorkflowDuration: 0,
    workflowSuccessRate: 0,
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    retriedTasks: 0,
    averageTaskDuration: 0,
    taskSuccessRate: 0,
    lastUpdated: new Date()
  };

  private workflowStartTimes = new Map<string, Date>();
  private taskStartTimes = new Map<string, Date>();
  private workflowDurations: number[] = [];
  private taskDurations: number[] = [];

  async handle(event: DomainEvent): Promise<void> {
    switch (event.eventType) {
      case EventTypes.WORKFLOW_STARTED:
        this.handleWorkflowStarted(event as WorkflowStartedEvent);
        break;
      case EventTypes.WORKFLOW_COMPLETED:
        this.handleWorkflowCompleted(event as WorkflowCompletedEvent);
        break;
      case EventTypes.WORKFLOW_FAILED:
        this.handleWorkflowFailed(event as WorkflowFailedEvent);
        break;
      case EventTypes.TASK_STARTED:
        this.handleTaskStarted(event as TaskStartedEvent);
        break;
      case EventTypes.TASK_COMPLETED:
        this.handleTaskCompleted(event as TaskCompletedEvent);
        break;
      case EventTypes.TASK_FAILED:
        this.handleTaskFailed(event as TaskFailedEvent);
        break;
      case EventTypes.TASK_RETRIED:
        this.handleTaskRetried(event as TaskRetriedEvent);
        break;
    }

    this.updateMetrics();
  }

  private handleWorkflowStarted(event: WorkflowStartedEvent): void {
    this.workflowStartTimes.set(event.aggregateId, event.occurredAt);
    this.metrics.totalWorkflows++;
  }

  private handleWorkflowCompleted(event: WorkflowCompletedEvent): void {
    this.metrics.completedWorkflows++;
    
    const startTime = this.workflowStartTimes.get(event.aggregateId);
    if (startTime) {
      const duration = event.occurredAt.getTime() - startTime.getTime();
      this.workflowDurations.push(duration);
      this.workflowStartTimes.delete(event.aggregateId);
    }
  }

  private handleWorkflowFailed(event: WorkflowFailedEvent): void {
    this.metrics.failedWorkflows++;
    
    const startTime = this.workflowStartTimes.get(event.aggregateId);
    if (startTime) {
      const duration = event.occurredAt.getTime() - startTime.getTime();
      this.workflowDurations.push(duration);
      this.workflowStartTimes.delete(event.aggregateId);
    }
  }

  private handleTaskStarted(event: TaskStartedEvent): void {
    this.taskStartTimes.set(event.aggregateId, event.occurredAt);
    this.metrics.totalTasks++;
  }

  private handleTaskCompleted(event: TaskCompletedEvent): void {
    this.metrics.completedTasks++;
    
    const startTime = this.taskStartTimes.get(event.aggregateId);
    if (startTime) {
      const duration = event.occurredAt.getTime() - startTime.getTime();
      this.taskDurations.push(duration);
      this.taskStartTimes.delete(event.aggregateId);
    }
  }

  private handleTaskFailed(event: TaskFailedEvent): void {
    this.metrics.failedTasks++;
    
    const startTime = this.taskStartTimes.get(event.aggregateId);
    if (startTime) {
      const duration = event.occurredAt.getTime() - startTime.getTime();
      this.taskDurations.push(duration);
      this.taskStartTimes.delete(event.aggregateId);
    }
  }

  private handleTaskRetried(_event: TaskRetriedEvent): void {
    this.metrics.retriedTasks++;
  }

  private updateMetrics(): void {
    // Calculate average workflow duration
    if (this.workflowDurations.length > 0) {
      this.metrics.averageWorkflowDuration = 
        this.workflowDurations.reduce((sum, duration) => sum + duration, 0) / 
        this.workflowDurations.length;
    }

    // Calculate workflow success rate
    const totalCompletedOrFailed = this.metrics.completedWorkflows + this.metrics.failedWorkflows;
    if (totalCompletedOrFailed > 0) {
      this.metrics.workflowSuccessRate = 
        (this.metrics.completedWorkflows / totalCompletedOrFailed) * 100;
    }

    // Calculate average task duration
    if (this.taskDurations.length > 0) {
      this.metrics.averageTaskDuration = 
        this.taskDurations.reduce((sum, duration) => sum + duration, 0) / 
        this.taskDurations.length;
    }

    // Calculate task success rate
    const totalCompletedOrFailedTasks = this.metrics.completedTasks + this.metrics.failedTasks;
    if (totalCompletedOrFailedTasks > 0) {
      this.metrics.taskSuccessRate = 
        (this.metrics.completedTasks / totalCompletedOrFailedTasks) * 100;
    }

    this.metrics.lastUpdated = new Date();
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): WorkflowMetrics {
    return { ...this.metrics };
  }

  /**
   * Get detailed performance statistics
   */
  getDetailedStats(): {
    metrics: WorkflowMetrics;
    workflowDurationStats: {
      min: number;
      max: number;
      median: number;
      p95: number;
    };
    taskDurationStats: {
      min: number;
      max: number;
      median: number;
      p95: number;
    };
  } {
    return {
      metrics: this.getMetrics(),
      workflowDurationStats: this.calculateDurationStats(this.workflowDurations),
      taskDurationStats: this.calculateDurationStats(this.taskDurations)
    };
  }

  private calculateDurationStats(durations: number[]): {
    min: number;
    max: number;
    median: number;
    p95: number;
  } {
    if (durations.length === 0) {
      return { min: 0, max: 0, median: 0, p95: 0 };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95 = sorted[p95Index];

    return { min, max, median, p95 };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      totalWorkflows: 0,
      completedWorkflows: 0,
      failedWorkflows: 0,
      averageWorkflowDuration: 0,
      workflowSuccessRate: 0,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      retriedTasks: 0,
      averageTaskDuration: 0,
      taskSuccessRate: 0,
      lastUpdated: new Date()
    };

    this.workflowStartTimes.clear();
    this.taskStartTimes.clear();
    this.workflowDurations = [];
    this.taskDurations = [];
  }

  /**
   * Export metrics to JSON format
   */
  exportMetrics(): string {
    const data = {
      metrics: this.getMetrics(),
      detailedStats: this.getDetailedStats(),
      exportedAt: new Date().toISOString()
    };
    
    return JSON.stringify(data, null, 2);
  }
}