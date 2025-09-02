/**
 * Domain Event Bridge
 * 
 * This service bridges the rich domain events system with the existing legacy EventBus interface.
 * It allows domain events to be published through the legacy interface while maintaining 
 * compatibility with existing code.
 */

import { DomainEvent, EventBus, EventHandler, BaseEventHandler } from '../domain-events';
import { EnhancedEventBusInterface, AppEvents } from '../interfaces/event-bus.interface';

/**
 * Bridge that converts domain events to legacy app events
 */
export class DomainEventBridge extends BaseEventHandler {
  protected eventTypes: string[] = ['*']; // Handle all events

  constructor(private legacyEventBus: EnhancedEventBusInterface) {
    super();
  }

  async handle(event: DomainEvent): Promise<void> {
    // Convert domain events to legacy app events
    const legacyEvent = this.convertToLegacyEvent(event);
    if (legacyEvent) {
      this.legacyEventBus.emit(legacyEvent.type as keyof AppEvents, legacyEvent.data);
    }
  }

  canHandle(_event: DomainEvent): boolean {
    return true; // Handle all domain events
  }

  private convertToLegacyEvent(event: DomainEvent): { type: string; data: any } | null {
    switch (event.eventType) {
      // Workflow events
      case 'WorkflowStartedEvent': {
        const workflowEvent = event as any; // Cast to access specific properties
        return {
          type: 'workflow:started',
          data: {
            workflowId: event.aggregateId,
            goal: workflowEvent.goal,
            sessionId: workflowEvent.sessionId
          }
        };
      }

      case 'WorkflowCompletedEvent': {
        const workflowEvent = event as any;
        return {
          type: 'workflow:completed',
          data: {
            workflowId: event.aggregateId,
            summary: workflowEvent.summary,
            duration: workflowEvent.duration,
            tasksCompleted: workflowEvent.tasksCompleted
          }
        };
      }

      case 'WorkflowFailedEvent': {
        const workflowEvent = event as any;
        return {
          type: 'workflow:error',
          data: {
            workflowId: event.aggregateId,
            reason: workflowEvent.reason,
            duration: workflowEvent.duration
          }
        };
      }

      // Step events
      case 'StepStartedEvent': {
        const stepEvent = event as any;
        return {
          type: 'step:started',
          data: {
            stepId: event.aggregateId,
            workflowId: stepEvent.workflowId?.toString?.(),
            description: stepEvent.description
          }
        };
      }

      case 'StepCompletedEvent': {
        const stepEvent = event as any;
        return {
          type: 'step:completed',
          data: {
            stepId: event.aggregateId,
            workflowId: stepEvent.workflowId?.toString?.(),
            description: stepEvent.description
          }
        };
      }

      case 'StepFailedEvent': {
        const stepEvent = event as any;
        return {
          type: 'step:failed',
          data: {
            stepId: event.aggregateId,
            workflowId: stepEvent.workflowId?.toString?.(),
            description: stepEvent.description,
            reason: stepEvent.reason
          }
        };
      }

      // Task events
      case 'TaskStartedEvent': {
        const taskEvent = event as any;
        return {
          type: 'task:started',
          data: {
            taskId: event.aggregateId,
            stepId: taskEvent.stepId?.toString?.(),
            workflowId: taskEvent.workflowId?.toString?.(),
            description: taskEvent.description,
            intent: taskEvent.intent
          }
        };
      }

      case 'TaskCompletedEvent': {
        const taskEvent = event as any;
        return {
          type: 'task:completed',
          data: {
            taskId: event.aggregateId,
            stepId: taskEvent.stepId?.toString?.(),
            workflowId: taskEvent.workflowId?.toString?.(),
            result: taskEvent.result,
            duration: taskEvent.duration
          }
        };
      }

      case 'TaskFailedEvent': {
        const taskEvent = event as any;
        return {
          type: 'task:failed',
          data: {
            taskId: event.aggregateId,
            stepId: taskEvent.stepId?.toString?.(),
            workflowId: taskEvent.workflowId?.toString?.(),
            reason: taskEvent.reason,
            duration: taskEvent.duration
          }
        };
      }

      // Plan events (trigger replanning)
      case 'PlanCreatedEvent': {
        const planEvent = event as any;
        return {
          type: 'replan:triggered',
          data: {
            planId: planEvent.planId?.toString?.(),
            workflowId: event.aggregateId,
            stepCount: planEvent.stepCount
          }
        };
      }

      default:
        // Don't convert unknown events
        return null;
    }
  }
}

/**
 * Enhanced Workflow Manager Event Bus that combines domain events with legacy events
 */
export class WorkflowEventBus implements EnhancedEventBusInterface {
  private domainEventBus: EventBus;
  private bridge: DomainEventBridge;
  private legacyEventBus: EnhancedEventBusInterface;

  constructor(legacyEventBus: EnhancedEventBusInterface) {
    this.legacyEventBus = legacyEventBus;
    this.domainEventBus = new EventBus();
    this.bridge = new DomainEventBridge(legacyEventBus);
    
    // Register the bridge to convert domain events to legacy events
    this.domainEventBus.register(this.bridge);
  }

  /**
   * Legacy EventBus interface methods - delegate to legacy bus
   */
  emit<E extends keyof AppEvents>(event: E, data: AppEvents[E]): void {
    this.legacyEventBus.emit(event, data);
  }

  on<E extends keyof AppEvents>(event: E, callback: (data: AppEvents[E]) => void): void {
    this.legacyEventBus.on(event, callback);
  }

  /**
   * Domain Events interface methods
   */
  async publishDomainEvent(event: DomainEvent): Promise<void> {
    await this.domainEventBus.publish(event);
  }

  async publishDomainEvents(events: DomainEvent[]): Promise<void> {
    await this.domainEventBus.publishMany(events);
  }

  registerDomainEventHandler<T extends DomainEvent>(handler: EventHandler<T>): void {
    this.domainEventBus.register(handler);
  }

  unregisterDomainEventHandler<T extends DomainEvent>(handler: EventHandler<T>): void {
    this.domainEventBus.unregister(handler);
  }

  getDomainEventHandlers(): EventHandler[] {
    return this.domainEventBus.getHandlers();
  }

  clearDomainEventHandlers(): void {
    this.domainEventBus.clear();
    // Re-register the bridge
    this.domainEventBus.register(this.bridge);
  }
}

/**
 * Factory for creating workflow event bus
 */
export class WorkflowEventBusFactory {
  static create(legacyEventBus: EnhancedEventBusInterface): WorkflowEventBus {
    return new WorkflowEventBus(legacyEventBus);
  }
}