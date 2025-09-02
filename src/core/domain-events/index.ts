/**
 * Domain Events Module
 * 
 * This module provides the complete domain events infrastructure for the DDD-based agents system.
 * It includes base event classes, specific event implementations, event bus, and event handlers.
 */

import { DomainEvent } from './base-events';

// Base events and infrastructure
export {
  DomainEvent,
  EventMetadata,
  EventData,
  EventStream
} from './base-events';

// Event bus and handlers infrastructure
export {
  EventHandler,
  BaseEventHandler,
  IEventBus,
  EventBus,
  EventBusFactory,
  EventMiddleware,
  EnhancedEventBus,
  StatisticsEventBus,
  EventStatistics
} from './event-bus';

// Workflow events
export {
  WorkflowCreatedEvent,
  WorkflowStartedEvent,
  PlanCreatedEvent,
  WorkflowCompletedEvent,
  WorkflowFailedEvent,
  WorkflowCancelledEvent,
  WorkflowPausedEvent,
  WorkflowResumedEvent
} from './workflow-events';

// Task events
export {
  TaskCreatedEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskRetriedEvent,
  TaskTimedOutEvent,
  TaskResult
} from './task-events';

// Step events
export {
  StepCreatedEvent,
  StepStartedEvent,
  StepCompletedEvent,
  StepFailedEvent
} from './step-events';

// Execution events
export {
  SessionStartedEvent,
  SessionEndedEvent,
  PageNavigationEvent,
  ElementInteractionEvent,
  DataExtractionEvent,
  ExecutionErrorEvent,
  BrowserConfig,
  NavigationType,
  InteractionType,
  ErrorType
} from './execution-events';

// Event handlers
export {
  LoggingEventHandler,
  MetricsEventHandler,
  PersistenceEventHandler,
  NotificationEventHandler,
  WorkflowMetrics,
  Notification,
  NotificationService
} from './event-handlers';

// Event store
export {
  IEventStore,
  EventStoreEntry,
  EventQuery,
  EventStoreStats,
  InMemoryEventStore
} from './event-store';

/**
 * Event type constants for easy reference
 */
export const EventTypes = {
  // Workflow events
  WORKFLOW_CREATED: 'WorkflowCreatedEvent',
  WORKFLOW_STARTED: 'WorkflowStartedEvent',
  WORKFLOW_COMPLETED: 'WorkflowCompletedEvent',
  WORKFLOW_FAILED: 'WorkflowFailedEvent',
  WORKFLOW_CANCELLED: 'WorkflowCancelledEvent',
  WORKFLOW_PAUSED: 'WorkflowPausedEvent',
  WORKFLOW_RESUMED: 'WorkflowResumedEvent',
  
  // Plan events
  PLAN_CREATED: 'PlanCreatedEvent',
  
  // Step events
  STEP_CREATED: 'StepCreatedEvent',
  STEP_STARTED: 'StepStartedEvent',
  STEP_COMPLETED: 'StepCompletedEvent',
  STEP_FAILED: 'StepFailedEvent',
  
  // Task events
  TASK_CREATED: 'TaskCreatedEvent',
  TASK_STARTED: 'TaskStartedEvent',
  TASK_COMPLETED: 'TaskCompletedEvent',
  TASK_FAILED: 'TaskFailedEvent',
  TASK_RETRIED: 'TaskRetriedEvent',
  TASK_TIMED_OUT: 'TaskTimedOutEvent',
  
  // Session events
  SESSION_STARTED: 'SessionStartedEvent',
  SESSION_ENDED: 'SessionEndedEvent',
  
  // Execution events
  PAGE_NAVIGATION: 'PageNavigationEvent',
  ELEMENT_INTERACTION: 'ElementInteractionEvent',
  DATA_EXTRACTION: 'DataExtractionEvent',
  EXECUTION_ERROR: 'ExecutionErrorEvent'
} as const;

/**
 * Event factory for creating events with proper typing
 */
export class EventFactory {
  /**
   * Create a workflow started event
   */
  static createWorkflowStartedEvent(
    workflowId: any,
    goal: string,
    sessionId?: string
  ) {
    const { WorkflowStartedEvent } = require('./workflow-events');
    return new WorkflowStartedEvent(workflowId, goal, sessionId);
  }

  /**
   * Create a task completed event
   */
  static createTaskCompletedEvent(
    taskId: any,
    stepId: any,
    workflowId: any,
    result: any,
    duration: number,
    confidence: number,
    evidence?: any
  ) {
    const { TaskCompletedEvent } = require('./task-events');
    return new TaskCompletedEvent(taskId, stepId, workflowId, result, duration, confidence, evidence);
  }

  /**
   * Create a workflow completed event
   */
  static createWorkflowCompletedEvent(
    workflowId: any,
    summary: string,
    extractedData: any,
    duration: number,
    tasksCompleted: number,
    finalUrl?: string
  ) {
    const { WorkflowCompletedEvent } = require('./workflow-events');
    return new WorkflowCompletedEvent(workflowId, summary, extractedData, duration, tasksCompleted, finalUrl);
  }
}

/**
 * Utility functions for working with events
 */
export class EventUtils {
  /**
   * Check if an event is a workflow-related event
   */
  static isWorkflowEvent(event: DomainEvent): boolean {
    return event.eventType.startsWith('Workflow');
  }

  /**
   * Check if an event is a task-related event
   */
  static isTaskEvent(event: DomainEvent): boolean {
    return event.eventType.startsWith('Task');
  }

  /**
   * Check if an event is a step-related event
   */
  static isStepEvent(event: DomainEvent): boolean {
    return event.eventType.startsWith('Step');
  }

  /**
   * Check if an event indicates a failure
   */
  static isFailureEvent(event: DomainEvent): boolean {
    return event.eventType.includes('Failed') || event.eventType.includes('Error');
  }

  /**
   * Check if an event indicates completion
   */
  static isCompletionEvent(event: DomainEvent): boolean {
    return event.eventType.includes('Completed');
  }

  /**
   * Extract aggregate ID from event
   */
  static getAggregateId(event: DomainEvent): string {
    return event.aggregateId;
  }

  /**
   * Sort events by timestamp
   */
  static sortByTimestamp(events: DomainEvent[]): DomainEvent[] {
    return events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  /**
   * Filter events by type
   */
  static filterByType(events: DomainEvent[], eventType: string): DomainEvent[] {
    return events.filter(event => event.eventType === eventType);
  }

  /**
   * Filter events by aggregate ID
   */
  static filterByAggregateId(events: DomainEvent[], aggregateId: string): DomainEvent[] {
    return events.filter(event => event.aggregateId === aggregateId);
  }

  /**
   * Group events by aggregate ID
   */
  static groupByAggregateId(events: DomainEvent[]): Map<string, DomainEvent[]> {
    const grouped = new Map<string, DomainEvent[]>();
    
    for (const event of events) {
      const aggregateId = event.aggregateId;
      if (!grouped.has(aggregateId)) {
        grouped.set(aggregateId, []);
      }
      grouped.get(aggregateId)!.push(event);
    }
    
    return grouped;
  }

  /**
   * Get event statistics
   */
  static getStatistics(events: DomainEvent[]): {
    totalEvents: number;
    eventsByType: Map<string, number>;
    eventsByAggregate: Map<string, number>;
    timespan: { earliest: Date | undefined; latest: Date | undefined };
  } {
    const eventsByType = new Map<string, number>();
    const eventsByAggregate = new Map<string, number>();
    let earliest: Date | undefined;
    let latest: Date | undefined;

    for (const event of events) {
      // Count by type
      eventsByType.set(event.eventType, (eventsByType.get(event.eventType) || 0) + 1);
      
      // Count by aggregate
      eventsByAggregate.set(event.aggregateId, (eventsByAggregate.get(event.aggregateId) || 0) + 1);
      
      // Track timespan
      if (!earliest || event.occurredAt < earliest) {
        earliest = event.occurredAt;
      }
      if (!latest || event.occurredAt > latest) {
        latest = event.occurredAt;
      }
    }

    return {
      totalEvents: events.length,
      eventsByType,
      eventsByAggregate,
      timespan: { earliest, latest }
    };
  }
}