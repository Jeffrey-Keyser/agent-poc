/**
 * Workflow Event Coordinator
 * 
 * Handles all event setup and coordination for workflow execution.
 * This service abstracts event management complexity from the main WorkflowManager.
 */

import { EnhancedEventBusInterface } from '../interfaces/event-bus.interface';
import { AgentReporter } from '../interfaces/agent-reporter.interface';
import { 
  WorkflowEventBus, 
  WorkflowEventBusFactory 
} from '../services/domain-event-bridge';
import { 
  EventHandlerFactory,
  WorkflowMetricsHandler,
  WorkflowLoggingHandler,
  TaskFailureHandler,
  WorkflowStuckHandler
} from '../../infrastructure/event-handlers';
import { InMemoryEventStore, IEventStore } from '../domain-events/event-store';
import { WorkflowSaga, SagaFactory } from '../sagas';

export interface EventCoordinatorConfig {
  enableDetailedLogging?: boolean;
  enableMetrics?: boolean;
  enableFailureRecovery?: boolean;
  enableSaga?: boolean;
}

export interface EventMetrics {
  totalWorkflows: number;
  successfulWorkflows: number;
  failedWorkflows: number;
  averageDuration: number;
}

export interface WorkflowEventCallbacks {
  onStart?: (data: any) => void;
  onComplete?: (data: any) => void;
  onError?: (error: any) => void;
  onStepComplete?: (step: any) => void;
}

/**
 * Coordinates all event-related functionality for workflow execution
 */
export class WorkflowEventCoordinator {
  private workflowEventBus: WorkflowEventBus;
  private eventStore: IEventStore;
  private metricsHandler: WorkflowMetricsHandler | null = null;
  private loggingHandler: WorkflowLoggingHandler | null = null;
  private taskFailureHandler: TaskFailureHandler | null = null;
  private workflowStuckHandler: WorkflowStuckHandler | null = null;
  private workflowSaga: WorkflowSaga | null = null;
  
  constructor(
    private eventBus: EnhancedEventBusInterface,
    private reporter: AgentReporter,
    private config: EventCoordinatorConfig = {}
  ) {
    // Set defaults
    this.config = {
      enableDetailedLogging: false,
      enableMetrics: true,
      enableFailureRecovery: true,
      enableSaga: true,
      ...config
    };

    this.workflowEventBus = WorkflowEventBusFactory.create(this.eventBus);
    this.eventStore = new InMemoryEventStore();
    this.setupEventHandlers();
  }

  /**
   * Setup and register all event handlers based on configuration
   */
  private setupEventHandlers(): void {
    if (this.config.enableMetrics || this.config.enableDetailedLogging || this.config.enableFailureRecovery) {
      // Create handlers based on configuration
      const handlers = EventHandlerFactory.createAdvancedHandlers(
        this.config.enableDetailedLogging || false
      );
      
      if (this.config.enableMetrics) {
        this.metricsHandler = handlers.metrics;
        this.workflowEventBus.registerDomainEventHandler(this.metricsHandler);
      }
      
      if (this.config.enableDetailedLogging) {
        this.loggingHandler = handlers.logging;
        this.workflowEventBus.registerDomainEventHandler(this.loggingHandler);
      }
      
      if (this.config.enableFailureRecovery) {
        this.taskFailureHandler = handlers.taskFailure;
        this.workflowStuckHandler = handlers.workflowStuck;
        this.workflowEventBus.registerDomainEventHandler(this.taskFailureHandler);
        this.workflowEventBus.registerDomainEventHandler(this.workflowStuckHandler);
      }
    }
    
    // Create and register workflow saga if enabled
    if (this.config.enableSaga) {
      this.workflowSaga = SagaFactory.createWorkflowSaga(this.reporter);
      this.workflowEventBus.registerDomainEventHandler(this.workflowSaga);
    }
    
    this.reporter.log('📡 Workflow event handlers registered');
  }

  /**
   * Emit a workflow event through both legacy and domain event systems
   */
  emitEvent(eventName: string, data: any): void {
    // Emit through legacy event bus
    this.eventBus.emit(eventName as any, data);
    
    // Store event for audit trail
    this.storeAuditEvent(eventName, data);
  }

  /**
   * Store an audit event for tracking
   */
  private async storeAuditEvent(eventName: string, data: any): Promise<void> {
    try {
      // Create a simple audit event that implements the DomainEvent interface
      const auditEvent = {
        eventId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        aggregateId: data.workflowId || data.stepId || data.taskId || 'unknown',
        eventType: eventName,
        version: 1,
        occurredAt: new Date(),
        getMetadata: () => ({
          eventId: auditEvent.eventId,
          aggregateId: auditEvent.aggregateId,
          eventType: auditEvent.eventType,
          occurredAt: auditEvent.occurredAt,
          version: auditEvent.version
        }),
        toJSON: () => data
      };
      
      await this.eventStore.store(auditEvent as any);
    } catch (error) {
      // Log but don't throw - audit failure shouldn't break workflow
      this.reporter.log(`⚠️ Failed to store audit event: ${error}`);
    }
  }

  /**
   * Setup state change listeners for workflow monitoring
   */
  setupStateChangeListeners(onStateChange: (state: any) => void): void {
    this.eventBus.on('state:captured', onStateChange);
    this.eventBus.on('state:checkpoint', onStateChange);
    this.eventBus.on('state:data-extracted', onStateChange);
  }

  /**
   * Setup workflow lifecycle listeners
   */
  setupWorkflowListeners(callbacks: WorkflowEventCallbacks): void {
    if (callbacks.onStart) {
      this.eventBus.on('workflow:started', callbacks.onStart);
    }
    if (callbacks.onComplete) {
      this.eventBus.on('workflow:completed', callbacks.onComplete);
    }
    if (callbacks.onError) {
      this.eventBus.on('workflow:error', callbacks.onError);
    }
    if (callbacks.onStepComplete) {
      this.eventBus.on('step:completed', callbacks.onStepComplete);
    }
  }

  /**
   * Get metrics from handlers if available
   */
  getMetrics(): EventMetrics {
    if (this.metricsHandler) {
      const workflowMetrics = this.metricsHandler.getMetrics();
      return {
        totalWorkflows: workflowMetrics.totalWorkflows,
        successfulWorkflows: workflowMetrics.completedWorkflows,
        failedWorkflows: workflowMetrics.failedWorkflows,
        averageDuration: workflowMetrics.averageWorkflowDuration
      };
    }
    
    // Return default metrics if handler not available
    return {
      totalWorkflows: 0,
      successfulWorkflows: 0,
      failedWorkflows: 0,
      averageDuration: 0
    };
  }

  /**
   * Get event history for a specific workflow or all events
   */
  async getEventHistory(workflowId?: string): Promise<any[]> {
    try {
      if (workflowId) {
        const entries = await this.eventStore.getEventsForAggregate(workflowId);
        return entries.map(entry => ({
          id: entry.id,
          eventType: entry.eventType,
          timestamp: entry.occurredAt,
          data: entry.event.toJSON()
        }));
      } else {
        const entries = await this.eventStore.getLatestEvents(100);
        return entries.map(entry => ({
          id: entry.id,
          eventType: entry.eventType,
          aggregateId: entry.aggregateId,
          timestamp: entry.occurredAt,
          data: entry.event.toJSON()
        }));
      }
    } catch (error) {
      this.reporter.log(`⚠️ Failed to get event history: ${error}`);
      return [];
    }
  }

  /**
   * Get event statistics for monitoring
   */
  async getEventStats(): Promise<any> {
    try {
      return await this.eventStore.getStats();
    } catch (error) {
      this.reporter.log(`⚠️ Failed to get event stats: ${error}`);
      return {
        totalEvents: 0,
        uniqueAggregates: 0,
        eventTypeDistribution: {},
        oldestEvent: null,
        newestEvent: null
      };
    }
  }

  /**
   * Get event timeline for debugging
   */
  async getEventTimeline(workflowId?: string): Promise<any[]> {
    try {
      if (this.eventStore instanceof InMemoryEventStore) {
        return await this.eventStore.getEventTimeline(workflowId);
      }
      return [];
    } catch (error) {
      this.reporter.log(`⚠️ Failed to get event timeline: ${error}`);
      return [];
    }
  }

  /**
   * Get the underlying workflow event bus for direct access if needed
   */
  getWorkflowEventBus(): WorkflowEventBus {
    return this.workflowEventBus;
  }

  /**
   * Check if specific handlers are enabled
   */
  isMetricsEnabled(): boolean {
    return this.metricsHandler !== null;
  }

  isLoggingEnabled(): boolean {
    return this.loggingHandler !== null;
  }

  isFailureRecoveryEnabled(): boolean {
    return this.taskFailureHandler !== null && this.workflowStuckHandler !== null;
  }

  isSagaEnabled(): boolean {
    return this.workflowSaga !== null;
  }

  /**
   * Cleanup event listeners and handlers
   */
  cleanup(): void {
    try {
      // Clear domain event handlers but preserve bridge
      this.workflowEventBus.clearDomainEventHandlers();
      
      // Clear event store
      this.eventStore.clear();
      
      // Reset handlers
      this.metricsHandler = null;
      this.loggingHandler = null;
      this.taskFailureHandler = null;
      this.workflowStuckHandler = null;
      this.workflowSaga = null;
      
      this.reporter.log('🧹 Event coordinator cleaned up');
    } catch (error) {
      this.reporter.log(`⚠️ Error during cleanup: ${error}`);
    }
  }
}