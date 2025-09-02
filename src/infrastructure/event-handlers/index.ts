/**
 * Infrastructure Event Handlers
 * 
 * This module provides infrastructure-level event handlers for workflow domain events.
 * These handlers implement cross-cutting concerns like metrics collection, logging,
 * and monitoring.
 */

import { 
  WorkflowMetricsHandler as MetricsHandler,
  WorkflowMetrics
} from './workflow-metrics-handler';

import { 
  WorkflowLoggingHandler as LoggingHandler,
  LogLevel,
  LogEntry
} from './workflow-logging-handler';

import { TaskFailureHandler } from './task-failure-handler';
import { WorkflowStuckHandler } from './workflow-stuck-handler';

export { 
  MetricsHandler as WorkflowMetricsHandler,
  WorkflowMetrics
};

export { 
  LoggingHandler as WorkflowLoggingHandler,
  LogLevel,
  LogEntry
};

// Advanced event handlers
export {
  TaskFailureHandler,
  FailureRetryPolicy,
  TaskFailureMetrics
} from './task-failure-handler';

export {
  WorkflowStuckHandler,
  WorkflowHealthMetrics,
  StuckDetectionPolicy
} from './workflow-stuck-handler';

/**
 * Factory for creating standard event handlers
 */
export class EventHandlerFactory {
  /**
   * Create a metrics handler
   */
  static createMetricsHandler(): MetricsHandler {
    return new MetricsHandler();
  }

  /**
   * Create a logging handler
   */
  static createLoggingHandler(enableConsole: boolean = true): LoggingHandler {
    return new LoggingHandler(enableConsole);
  }

  /**
   * Create a task failure handler
   */
  static createTaskFailureHandler(): TaskFailureHandler {
    return new TaskFailureHandler();
  }

  /**
   * Create a workflow stuck handler
   */
  static createWorkflowStuckHandler(): WorkflowStuckHandler {
    return new WorkflowStuckHandler();
  }

  /**
   * Create all standard handlers
   */
  static createStandardHandlers(enableConsoleLogging: boolean = true): {
    metrics: MetricsHandler;
    logging: LoggingHandler;
  } {
    return {
      metrics: this.createMetricsHandler(),
      logging: this.createLoggingHandler(enableConsoleLogging)
    };
  }

  /**
   * Create all advanced handlers (includes standard + failure recovery)
   */
  static createAdvancedHandlers(enableConsoleLogging: boolean = true): {
    metrics: MetricsHandler;
    logging: LoggingHandler;
    taskFailure: TaskFailureHandler;
    workflowStuck: WorkflowStuckHandler;
  } {
    return {
      ...this.createStandardHandlers(enableConsoleLogging),
      taskFailure: this.createTaskFailureHandler(),
      workflowStuck: this.createWorkflowStuckHandler()
    };
  }
}