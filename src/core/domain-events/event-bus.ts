import { DomainEvent } from './base-events';

/**
 * Event handler interface
 * All event handlers must implement this interface
 */
export interface EventHandler<T extends DomainEvent = DomainEvent> {
  handle(event: T): Promise<void>;
  canHandle(event: DomainEvent): boolean;
  getEventTypes(): string[];
}

/**
 * Abstract base event handler class
 */
export abstract class BaseEventHandler<T extends DomainEvent = DomainEvent> implements EventHandler<T> {
  protected abstract eventTypes: string[];

  abstract handle(event: T): Promise<void>;

  canHandle(event: DomainEvent): boolean {
    return this.eventTypes.includes(event.eventType);
  }

  getEventTypes(): string[] {
    return [...this.eventTypes];
  }
}

/**
 * Event bus interface
 */
export interface IEventBus {
  register<T extends DomainEvent>(handler: EventHandler<T>): void;
  unregister<T extends DomainEvent>(handler: EventHandler<T>): void;
  publish(event: DomainEvent): Promise<void>;
  publishMany(events: DomainEvent[]): Promise<void>;
  getHandlers(): EventHandler[];
  clear(): void;
}

/**
 * In-memory event bus implementation
 */
export class EventBus implements IEventBus {
  private handlers: Map<string, EventHandler[]> = new Map();
  private allHandlers: Set<EventHandler> = new Set();

  /**
   * Register an event handler
   */
  register<T extends DomainEvent>(handler: EventHandler<T>): void {
    const eventTypes = handler.getEventTypes();
    
    for (const eventType of eventTypes) {
      if (!this.handlers.has(eventType)) {
        this.handlers.set(eventType, []);
      }
      this.handlers.get(eventType)!.push(handler);
    }

    this.allHandlers.add(handler);
  }

  /**
   * Unregister an event handler
   */
  unregister<T extends DomainEvent>(handler: EventHandler<T>): void {
    const eventTypes = handler.getEventTypes();
    
    for (const eventType of eventTypes) {
      const handlers = this.handlers.get(eventType);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
        
        if (handlers.length === 0) {
          this.handlers.delete(eventType);
        }
      }
    }

    this.allHandlers.delete(handler);
  }

  /**
   * Publish a single event
   */
  async publish(event: DomainEvent): Promise<void> {
    const eventType = event.eventType;
    const handlers = this.handlers.get(eventType) || [];
    
    // Execute all handlers concurrently
    const promises = handlers
      .filter(handler => handler.canHandle(event))
      .map(handler => this.executeHandler(handler, event));

    try {
      await Promise.all(promises);
    } catch (error) {
      console.error(`Error publishing event ${eventType}:`, error);
      throw error;
    }
  }

  /**
   * Publish multiple events sequentially
   */
  async publishMany(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  /**
   * Get all registered handlers
   */
  getHandlers(): EventHandler[] {
    return Array.from(this.allHandlers);
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
    this.allHandlers.clear();
  }

  /**
   * Execute a handler with error handling
   */
  private async executeHandler(handler: EventHandler, event: DomainEvent): Promise<void> {
    try {
      await handler.handle(event);
    } catch (error) {
      console.error(`Error in event handler ${handler.constructor.name} for event ${event.eventType}:`, error);
      throw error;
    }
  }

  /**
   * Get handlers for a specific event type
   */
  getHandlersForEventType(eventType: string): EventHandler[] {
    return this.handlers.get(eventType) || [];
  }

  /**
   * Check if any handlers are registered for an event type
   */
  hasHandlersFor(eventType: string): boolean {
    const handlers = this.handlers.get(eventType);
    return handlers !== undefined && handlers.length > 0;
  }
}

/**
 * Event bus factory
 */
export class EventBusFactory {
  private static instance: EventBus | null = null;

  static getInstance(): EventBus {
    if (!this.instance) {
      this.instance = new EventBus();
    }
    return this.instance;
  }

  static createNew(): EventBus {
    return new EventBus();
  }

  static reset(): void {
    this.instance = null;
  }
}

/**
 * Event middleware interface
 */
export interface EventMiddleware {
  handle(event: DomainEvent, next: (event: DomainEvent) => Promise<void>): Promise<void>;
}

/**
 * Enhanced event bus with middleware support
 */
export class EnhancedEventBus extends EventBus {
  private middlewares: EventMiddleware[] = [];

  addMiddleware(middleware: EventMiddleware): void {
    this.middlewares.push(middleware);
  }

  removeMiddleware(middleware: EventMiddleware): void {
    const index = this.middlewares.indexOf(middleware);
    if (index !== -1) {
      this.middlewares.splice(index, 1);
    }
  }

  async publish(event: DomainEvent): Promise<void> {
    if (this.middlewares.length === 0) {
      return super.publish(event);
    }

    let index = 0;
    
    const next = async (currentEvent: DomainEvent): Promise<void> => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        await middleware.handle(currentEvent, next);
      } else {
        await super.publish(currentEvent);
      }
    };

    await next(event);
  }
}

/**
 * Event statistics interface
 */
export interface EventStatistics {
  totalEvents: number;
  eventsByType: Map<string, number>;
  handlersCount: number;
  lastEventTime?: Date;
  averageHandlingTime?: number;
}

/**
 * Event bus with statistics tracking
 */
export class StatisticsEventBus extends EventBus {
  private statistics: EventStatistics = {
    totalEvents: 0,
    eventsByType: new Map(),
    handlersCount: 0
  };

  async publish(event: DomainEvent): Promise<void> {
    const startTime = Date.now();
    
    await super.publish(event);
    
    const duration = Date.now() - startTime;
    
    // Update statistics
    this.statistics.totalEvents++;
    this.statistics.eventsByType.set(
      event.eventType, 
      (this.statistics.eventsByType.get(event.eventType) || 0) + 1
    );
    this.statistics.lastEventTime = new Date();
    this.statistics.handlersCount = this.getHandlers().length;
    
    // Calculate average handling time
    if (this.statistics.averageHandlingTime) {
      this.statistics.averageHandlingTime = 
        (this.statistics.averageHandlingTime + duration) / 2;
    } else {
      this.statistics.averageHandlingTime = duration;
    }
  }

  getStatistics(): EventStatistics {
    return {
      ...this.statistics,
      eventsByType: new Map(this.statistics.eventsByType)
    };
  }

  resetStatistics(): void {
    this.statistics = {
      totalEvents: 0,
      eventsByType: new Map(),
      handlersCount: this.getHandlers().length
    };
  }
}