/**
 * Workflow Logging Event Handler
 * 
 * This handler provides comprehensive logging of all workflow domain events.
 * It creates structured logs for debugging, auditing, and monitoring purposes.
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
  StepStartedEvent,
  StepCompletedEvent,
  StepFailedEvent,
  PlanCreatedEvent,
  EventTypes
} from '../../core/domain-events';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  eventType: string;
  aggregateId: string;
  message: string;
  data: any;
}

/**
 * Event handler that creates structured logs for all domain events
 */
export class WorkflowLoggingHandler extends BaseEventHandler {
  protected eventTypes = ['*']; // Handle all events

  private logs: LogEntry[] = [];
  private maxLogEntries: number = 1000; // Prevent memory leaks

  constructor(private enableConsoleOutput: boolean = true) {
    super();
  }

  async handle(event: DomainEvent): Promise<void> {
    const logEntry = this.createLogEntry(event);
    
    // Add to internal log store
    this.logs.push(logEntry);
    
    // Trim logs if needed
    if (this.logs.length > this.maxLogEntries) {
      this.logs = this.logs.slice(-this.maxLogEntries);
    }
    
    // Output to console if enabled
    if (this.enableConsoleOutput) {
      this.outputToConsole(logEntry);
    }
  }

  private createLogEntry(event: DomainEvent): LogEntry {
    const timestamp = event.occurredAt;
    const eventType = event.eventType;
    const aggregateId = event.aggregateId;
    
    let level: LogLevel;
    let message: string;
    let data: any;

    switch (eventType) {
      case EventTypes.WORKFLOW_STARTED:
        const workflowStarted = event as WorkflowStartedEvent;
        level = LogLevel.INFO;
        message = `Workflow started: ${workflowStarted.goal}`;
        data = { goal: workflowStarted.goal, workflowId: workflowStarted.workflowId.toString(), sessionId: workflowStarted.sessionId };
        break;

      case EventTypes.WORKFLOW_COMPLETED:
        const workflowCompleted = event as WorkflowCompletedEvent;
        level = LogLevel.INFO;
        message = `Workflow completed successfully: ${workflowCompleted.summary}`;
        data = {
          summary: workflowCompleted.summary,
          duration: workflowCompleted.duration,
          tasksCompleted: workflowCompleted.tasksCompleted
        };
        break;

      case EventTypes.WORKFLOW_FAILED:
        const workflowFailed = event as WorkflowFailedEvent;
        level = LogLevel.ERROR;
        message = `Workflow failed: ${workflowFailed.reason}`;
        data = {
          reason: workflowFailed.reason,
          duration: workflowFailed.duration
        };
        break;

      case EventTypes.PLAN_CREATED:
        const planCreated = event as PlanCreatedEvent;
        level = LogLevel.INFO;
        message = `Plan created with ${planCreated.stepCount} steps`;
        data = {
          workflowId: planCreated.workflowId.toString(),
          planId: planCreated.planId.toString(),
          stepCount: planCreated.stepCount
        };
        break;

      case EventTypes.STEP_STARTED:
        const stepStarted = event as StepStartedEvent;
        level = LogLevel.DEBUG;
        message = `Step started: Step ${stepStarted.order} (${stepStarted.taskCount} tasks)`;
        data = { stepId: stepStarted.stepId.toString(), workflowId: stepStarted.workflowId.toString(), order: stepStarted.order, taskCount: stepStarted.taskCount };
        break;

      case EventTypes.STEP_COMPLETED:
        const stepCompleted = event as StepCompletedEvent;
        level = LogLevel.DEBUG;
        message = `Step completed: ${stepCompleted.tasksCompleted}/${stepCompleted.tasksCompleted + stepCompleted.tasksFailed} tasks (Duration: ${stepCompleted.duration}ms)`;
        data = { stepId: stepCompleted.stepId.toString(), workflowId: stepCompleted.workflowId.toString(), tasksCompleted: stepCompleted.tasksCompleted, tasksFailed: stepCompleted.tasksFailed, duration: stepCompleted.duration };
        break;

      case EventTypes.STEP_FAILED:
        const stepFailed = event as StepFailedEvent;
        level = LogLevel.WARN;
        message = `Step failed: ${stepFailed.reason} (${stepFailed.tasksFailed} tasks failed)`;
        data = { stepId: stepFailed.stepId.toString(), workflowId: stepFailed.workflowId.toString(), reason: stepFailed.reason, tasksFailed: stepFailed.tasksFailed };
        break;

      case EventTypes.TASK_STARTED:
        const taskStarted = event as TaskStartedEvent;
        level = LogLevel.DEBUG;
        message = `Task started: Attempt ${taskStarted.attempt}`;
        data = {
          taskId: taskStarted.taskId.toString(),
          stepId: taskStarted.stepId.toString(),
          workflowId: taskStarted.workflowId.toString(),
          attempt: taskStarted.attempt,
          context: taskStarted.context
        };
        break;

      case EventTypes.TASK_COMPLETED:
        const taskCompleted = event as TaskCompletedEvent;
        level = LogLevel.DEBUG;
        message = `Task completed: ${taskCompleted.taskId.toString()}`;
        data = {
          taskId: taskCompleted.taskId.toString(),
          stepId: taskCompleted.stepId.toString(),
          workflowId: taskCompleted.workflowId.toString(),
          result: taskCompleted.result,
          duration: taskCompleted.duration,
          confidence: taskCompleted.confidence
        };
        break;

      case EventTypes.TASK_FAILED:
        const taskFailed = event as TaskFailedEvent;
        level = LogLevel.WARN;
        message = `Task failed: ${taskFailed.error.message} (Attempt ${taskFailed.attempt}) ${taskFailed.willRetry ? '(will retry)' : '(final failure)'}`;
        data = {
          taskId: taskFailed.taskId.toString(),
          stepId: taskFailed.stepId.toString(),
          workflowId: taskFailed.workflowId.toString(),
          error: taskFailed.error.message,
          attempt: taskFailed.attempt,
          willRetry: taskFailed.willRetry,
          duration: taskFailed.duration
        };
        break;

      case EventTypes.TASK_RETRIED:
        const taskRetried = event as TaskRetriedEvent;
        level = LogLevel.WARN;
        message = `Task retry: Attempt ${taskRetried.attempt} - ${taskRetried.previousError} (delay: ${taskRetried.retryDelay}ms)`;
        data = {
          taskId: taskRetried.taskId.toString(),
          stepId: taskRetried.stepId.toString(),
          workflowId: taskRetried.workflowId.toString(),
          previousError: taskRetried.previousError,
          attempt: taskRetried.attempt,
          retryDelay: taskRetried.retryDelay
        };
        break;

      default:
        level = LogLevel.DEBUG;
        message = `Domain event: ${eventType}`;
        data = {};
        break;
    }

    return {
      timestamp,
      level,
      eventType,
      aggregateId,
      message,
      data
    };
  }

  private outputToConsole(logEntry: LogEntry): void {
    const timestamp = logEntry.timestamp.toISOString();
    const prefix = `[${timestamp}] [${logEntry.level.toUpperCase()}] [${logEntry.eventType}]`;
    const message = `${prefix} ${logEntry.message}`;

    switch (logEntry.level) {
      case LogLevel.ERROR:
        console.error(message, logEntry.data);
        break;
      case LogLevel.WARN:
        console.warn(message, logEntry.data);
        break;
      case LogLevel.INFO:
        console.info(message, logEntry.data);
        break;
      case LogLevel.DEBUG:
      default:
        console.debug(message, logEntry.data);
        break;
    }
  }

  /**
   * Get all log entries
   */
  getLogs(): ReadonlyArray<LogEntry> {
    return [...this.logs];
  }

  /**
   * Get log entries by level
   */
  getLogsByLevel(level: LogLevel): ReadonlyArray<LogEntry> {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Get log entries by event type
   */
  getLogsByEventType(eventType: string): ReadonlyArray<LogEntry> {
    return this.logs.filter(log => log.eventType === eventType);
  }

  /**
   * Get log entries by aggregate ID
   */
  getLogsByAggregateId(aggregateId: string): ReadonlyArray<LogEntry> {
    return this.logs.filter(log => log.aggregateId === aggregateId);
  }

  /**
   * Get log entries within a time range
   */
  getLogsInRange(startTime: Date, endTime: Date): ReadonlyArray<LogEntry> {
    return this.logs.filter(log => 
      log.timestamp >= startTime && log.timestamp <= endTime
    );
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Set maximum number of log entries to keep in memory
   */
  setMaxLogEntries(max: number): void {
    this.maxLogEntries = max;
    if (this.logs.length > max) {
      this.logs = this.logs.slice(-max);
    }
  }

  /**
   * Enable or disable console output
   */
  setConsoleOutput(enabled: boolean): void {
    this.enableConsoleOutput = enabled;
  }

  /**
   * Export logs to JSON format
   */
  exportLogs(): string {
    const data = {
      logs: this.getLogs(),
      exportedAt: new Date().toISOString(),
      totalEntries: this.logs.length
    };
    
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export logs to CSV format
   */
  exportLogsToCSV(): string {
    const headers = ['timestamp', 'level', 'eventType', 'aggregateId', 'message'];
    const csvRows = [headers.join(',')];
    
    for (const log of this.logs) {
      const row = [
        log.timestamp.toISOString(),
        log.level,
        log.eventType,
        log.aggregateId,
        `"${log.message.replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    }
    
    return csvRows.join('\n');
  }

  /**
   * Create a summary of log activity
   */
  getLogSummary(): {
    totalLogs: number;
    logsByLevel: Record<string, number>;
    logsByEventType: Record<string, number>;
    timeRange: { earliest: Date | null; latest: Date | null };
  } {
    const logsByLevel: Record<string, number> = {};
    const logsByEventType: Record<string, number> = {};
    let earliest: Date | null = null;
    let latest: Date | null = null;

    for (const log of this.logs) {
      // Count by level
      logsByLevel[log.level] = (logsByLevel[log.level] || 0) + 1;
      
      // Count by event type
      logsByEventType[log.eventType] = (logsByEventType[log.eventType] || 0) + 1;
      
      // Track time range
      if (!earliest || log.timestamp < earliest) {
        earliest = log.timestamp;
      }
      if (!latest || log.timestamp > latest) {
        latest = log.timestamp;
      }
    }

    return {
      totalLogs: this.logs.length,
      logsByLevel,
      logsByEventType,
      timeRange: { earliest, latest }
    };
  }
}