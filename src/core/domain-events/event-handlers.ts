import { BaseEventHandler } from './event-bus';
import { DomainEvent } from './base-events';
import { WorkflowStartedEvent, WorkflowCompletedEvent, WorkflowFailedEvent } from './workflow-events';
import { TaskCompletedEvent, TaskFailedEvent, TaskRetriedEvent } from './task-events';
import { StepCompletedEvent, StepFailedEvent } from './step-events';
import { ExecutionErrorEvent } from './execution-events';

/**
 * Logging event handler
 * Logs all events to console for debugging
 */
export class LoggingEventHandler extends BaseEventHandler {
  protected eventTypes = [
    'WorkflowStartedEvent',
    'WorkflowCompletedEvent',
    'WorkflowFailedEvent',
    'TaskCompletedEvent',
    'TaskFailedEvent',
    'StepCompletedEvent',
    'StepFailedEvent',
    'ExecutionErrorEvent',
    'SessionStartedEvent',
    'SessionEndedEvent'
  ];

  constructor(
    // private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info',
    private includeEventData: boolean = true
  ) {
    super();
  }

  async handle(event: DomainEvent): Promise<void> {
    const logMethod = this.getLogMethod(event);
    const message = this.formatLogMessage(event);
    
    if (this.includeEventData) {
      logMethod(message, event);
    } else {
      logMethod(message);
    }
  }

  private getLogMethod(event: DomainEvent): (message: string, ...args: any[]) => void {
    if (event.eventType.includes('Failed') || event.eventType.includes('Error')) {
      return console.error;
    } else if (event.eventType.includes('Started') || event.eventType.includes('Completed')) {
      return console.info;
    } else {
      return console.log;
    }
  }

  private formatLogMessage(event: DomainEvent): string {
    const timestamp = event.occurredAt.toISOString();
    return `[${timestamp}] ${event.eventType} - Aggregate: ${event.aggregateId}`;
  }
}

/**
 * Metrics collection event handler
 * Collects metrics and statistics from events
 */
export class MetricsEventHandler extends BaseEventHandler {
  protected eventTypes = [
    'WorkflowStartedEvent',
    'WorkflowCompletedEvent',
    'WorkflowFailedEvent',
    'TaskCompletedEvent',
    'TaskFailedEvent',
    'TaskRetriedEvent',
    'StepCompletedEvent',
    'StepFailedEvent',
    'ExecutionErrorEvent'
  ];

  private metrics: WorkflowMetrics = {
    workflowsStarted: 0,
    workflowsCompleted: 0,
    workflowsFailed: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    tasksRetried: 0,
    stepsCompleted: 0,
    stepsFailed: 0,
    executionErrors: 0,
    averageWorkflowDuration: 0,
    averageTaskDuration: 0,
    successRate: 0,
    retryRate: 0
  };

  private workflowStartTimes: Map<string, Date> = new Map();
  private taskStartTimes: Map<string, Date> = new Map();
  private workflowDurations: number[] = [];
  private taskDurations: number[] = [];

  async handle(event: DomainEvent): Promise<void> {
    switch (event.eventType) {
      case 'WorkflowStartedEvent':
        await this.handleWorkflowStarted(event as WorkflowStartedEvent);
        break;
      case 'WorkflowCompletedEvent':
        await this.handleWorkflowCompleted(event as WorkflowCompletedEvent);
        break;
      case 'WorkflowFailedEvent':
        await this.handleWorkflowFailed(event as WorkflowFailedEvent);
        break;
      case 'TaskCompletedEvent':
        await this.handleTaskCompleted(event as TaskCompletedEvent);
        break;
      case 'TaskFailedEvent':
        await this.handleTaskFailed(event as TaskFailedEvent);
        break;
      case 'TaskRetriedEvent':
        await this.handleTaskRetried(event as TaskRetriedEvent);
        break;
      case 'StepCompletedEvent':
        await this.handleStepCompleted(event as StepCompletedEvent);
        break;
      case 'StepFailedEvent':
        await this.handleStepFailed(event as StepFailedEvent);
        break;
      case 'ExecutionErrorEvent':
        await this.handleExecutionError(event as ExecutionErrorEvent);
        break;
    }

    this.updateDerivedMetrics();
  }

  private async handleWorkflowStarted(event: WorkflowStartedEvent): Promise<void> {
    this.metrics.workflowsStarted++;
    this.workflowStartTimes.set(event.workflowId.toString(), event.occurredAt);
  }

  private async handleWorkflowCompleted(event: WorkflowCompletedEvent): Promise<void> {
    this.metrics.workflowsCompleted++;
    
    const startTime = this.workflowStartTimes.get(event.workflowId.toString());
    if (startTime) {
      const duration = event.duration;
      this.workflowDurations.push(duration);
      this.workflowStartTimes.delete(event.workflowId.toString());
    }
  }

  private async handleWorkflowFailed(event: WorkflowFailedEvent): Promise<void> {
    this.metrics.workflowsFailed++;
    this.workflowStartTimes.delete(event.workflowId.toString());
  }

  private async handleTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    this.metrics.tasksCompleted++;
    this.taskDurations.push(event.duration);
  }

  private async handleTaskFailed(_event: TaskFailedEvent): Promise<void> {
    this.metrics.tasksFailed++;
  }

  private async handleTaskRetried(_event: TaskRetriedEvent): Promise<void> {
    this.metrics.tasksRetried++;
  }

  private async handleStepCompleted(_event: StepCompletedEvent): Promise<void> {
    this.metrics.stepsCompleted++;
  }

  private async handleStepFailed(_event: StepFailedEvent): Promise<void> {
    this.metrics.stepsFailed++;
  }

  private async handleExecutionError(_event: ExecutionErrorEvent): Promise<void> {
    this.metrics.executionErrors++;
  }

  private updateDerivedMetrics(): void {
    // Calculate average durations
    if (this.workflowDurations.length > 0) {
      this.metrics.averageWorkflowDuration = 
        this.workflowDurations.reduce((sum, duration) => sum + duration, 0) / this.workflowDurations.length;
    }

    if (this.taskDurations.length > 0) {
      this.metrics.averageTaskDuration = 
        this.taskDurations.reduce((sum, duration) => sum + duration, 0) / this.taskDurations.length;
    }

    // Calculate success rate
    const totalWorkflows = this.metrics.workflowsCompleted + this.metrics.workflowsFailed;
    if (totalWorkflows > 0) {
      this.metrics.successRate = (this.metrics.workflowsCompleted / totalWorkflows) * 100;
    }

    // Calculate retry rate
    const totalTasks = this.metrics.tasksCompleted + this.metrics.tasksFailed;
    if (totalTasks > 0) {
      this.metrics.retryRate = (this.metrics.tasksRetried / totalTasks) * 100;
    }
  }

  getMetrics(): WorkflowMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      workflowsStarted: 0,
      workflowsCompleted: 0,
      workflowsFailed: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksRetried: 0,
      stepsCompleted: 0,
      stepsFailed: 0,
      executionErrors: 0,
      averageWorkflowDuration: 0,
      averageTaskDuration: 0,
      successRate: 0,
      retryRate: 0
    };
    this.workflowStartTimes.clear();
    this.taskStartTimes.clear();
    this.workflowDurations = [];
    this.taskDurations = [];
  }
}

/**
 * Persistence event handler
 * Persists events to storage (simplified in-memory version)
 */
export class PersistenceEventHandler extends BaseEventHandler {
  protected eventTypes = [
    'WorkflowStartedEvent',
    'WorkflowCompletedEvent',
    'WorkflowFailedEvent',
    'TaskCompletedEvent',
    'TaskFailedEvent',
    'StepCompletedEvent',
    'StepFailedEvent',
    'ExecutionErrorEvent'
  ];

  private eventStore: Map<string, DomainEvent[]> = new Map();

  async handle(event: DomainEvent): Promise<void> {
    const aggregateId = event.aggregateId;
    
    if (!this.eventStore.has(aggregateId)) {
      this.eventStore.set(aggregateId, []);
    }
    
    this.eventStore.get(aggregateId)!.push(event);
  }

  getEventsForAggregate(aggregateId: string): DomainEvent[] {
    return this.eventStore.get(aggregateId) || [];
  }

  getAllEvents(): DomainEvent[] {
    const allEvents: DomainEvent[] = [];
    const eventArrays = Array.from(this.eventStore.values());
    for (const events of eventArrays) {
      allEvents.push(...events);
    }
    return allEvents.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  getEventsByType(eventType: string): DomainEvent[] {
    return this.getAllEvents().filter(event => event.eventType === eventType);
  }

  clearEvents(): void {
    this.eventStore.clear();
  }

  getEventStore(): Map<string, DomainEvent[]> {
    return new Map(this.eventStore);
  }
}

/**
 * Notification event handler
 * Sends notifications for critical events
 */
export class NotificationEventHandler extends BaseEventHandler {
  protected eventTypes = [
    'WorkflowFailedEvent',
    'TaskFailedEvent',
    'StepFailedEvent',
    'ExecutionErrorEvent'
  ];

  constructor(
    private notificationService?: NotificationService
  ) {
    super();
  }

  async handle(event: DomainEvent): Promise<void> {
    const notification = this.createNotification(event);
    
    if (this.notificationService) {
      await this.notificationService.send(notification);
    } else {
      // Fallback to console notification
      console.warn(`🚨 NOTIFICATION: ${notification.title} - ${notification.message}`);
    }
  }

  private createNotification(event: DomainEvent): Notification {
    switch (event.eventType) {
      case 'WorkflowFailedEvent': {
        const failedEvent = event as WorkflowFailedEvent;
        return {
          title: 'Workflow Failed',
          message: `Workflow ${failedEvent.workflowId.toString()} failed: ${failedEvent.reason}`,
          priority: 'high',
          timestamp: event.occurredAt,
          data: { workflowId: failedEvent.workflowId.toString(), reason: failedEvent.reason }
        };
      }
      case 'TaskFailedEvent': {
        const failedEvent = event as TaskFailedEvent;
        return {
          title: 'Task Failed',
          message: `Task ${failedEvent.taskId.toString()} failed: ${failedEvent.error.message}`,
          priority: failedEvent.willRetry ? 'medium' : 'high',
          timestamp: event.occurredAt,
          data: { taskId: failedEvent.taskId.toString(), error: failedEvent.error.message }
        };
      }
      case 'ExecutionErrorEvent': {
        const errorEvent = event as ExecutionErrorEvent;
        return {
          title: 'Execution Error',
          message: `Execution error in task ${errorEvent.taskId.toString()}: ${errorEvent.error.message}`,
          priority: errorEvent.recoverable ? 'medium' : 'high',
          timestamp: event.occurredAt,
          data: { taskId: errorEvent.taskId.toString(), error: errorEvent.error.message }
        };
      }
      default:
        return {
          title: 'System Alert',
          message: `Event ${event.eventType} occurred`,
          priority: 'low',
          timestamp: event.occurredAt,
          data: { eventType: event.eventType }
        };
    }
  }
}

/**
 * Supporting interfaces
 */
export interface WorkflowMetrics {
  workflowsStarted: number;
  workflowsCompleted: number;
  workflowsFailed: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksRetried: number;
  stepsCompleted: number;
  stepsFailed: number;
  executionErrors: number;
  averageWorkflowDuration: number;
  averageTaskDuration: number;
  successRate: number;
  retryRate: number;
}

export interface Notification {
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: Date;
  data?: Record<string, any>;
}

export interface NotificationService {
  send(notification: Notification): Promise<void>;
}