/**
 * Base domain event class
 * All domain events inherit from this base class to ensure consistency
 */
export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly aggregateId: string;
  public readonly occurredAt: Date;
  public readonly eventType: string;
  public readonly version: number;

  constructor(
    aggregateId: string,
    occurredAt: Date = new Date(),
    version: number = 1
  ) {
    this.eventId = this.generateEventId();
    this.aggregateId = aggregateId;
    this.occurredAt = occurredAt;
    this.eventType = this.constructor.name;
    this.version = version;
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get event metadata for serialization
   */
  getMetadata(): EventMetadata {
    return {
      eventId: this.eventId,
      aggregateId: this.aggregateId,
      eventType: this.eventType,
      occurredAt: this.occurredAt,
      version: this.version
    };
  }

  /**
   * Serialize the event to JSON
   */
  abstract toJSON(): Record<string, any>;

  /**
   * Create event from JSON data
   */
  static fromJSON?(data: Record<string, any>): DomainEvent;
}

/**
 * Event metadata interface
 */
export interface EventMetadata {
  eventId: string;
  aggregateId: string;
  eventType: string;
  occurredAt: Date;
  version: number;
}

/**
 * Base event data for all domain events
 */
export interface EventData {
  aggregateId: string;
  occurredAt?: Date;
  version?: number;
}

/**
 * Event stream interface for event storage
 */
export interface EventStream {
  aggregateId: string;
  events: DomainEvent[];
  version: number;
  lastModified: Date;
}