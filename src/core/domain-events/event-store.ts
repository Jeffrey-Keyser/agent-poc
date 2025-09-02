/**
 * Event Store
 * 
 * This module provides event storage and retrieval capabilities for domain events.
 * It enables event sourcing, audit trails, and event replay functionality.
 */

import { DomainEvent } from './base-events';

export interface EventStoreEntry {
  id: string;
  event: DomainEvent;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: Date;
  storedAt: Date;
  metadata: Record<string, any> | undefined;
}

export interface EventQuery {
  aggregateId?: string;
  eventType?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface EventStoreStats {
  totalEvents: number;
  uniqueAggregates: number;
  eventTypeDistribution: Record<string, number>;
  oldestEvent: Date | null;
  newestEvent: Date | null;
}

/**
 * Event Store interface for storing and retrieving domain events
 */
export interface IEventStore {
  /**
   * Store a single event
   */
  store(event: DomainEvent, metadata?: Record<string, any>): Promise<void>;

  /**
   * Store multiple events
   */
  storeMany(events: DomainEvent[], metadata?: Record<string, any>): Promise<void>;

  /**
   * Get events by query
   */
  getEvents(query: EventQuery): Promise<EventStoreEntry[]>;

  /**
   * Get events for a specific aggregate
   */
  getEventsForAggregate(aggregateId: string, fromVersion?: number): Promise<EventStoreEntry[]>;

  /**
   * Get all events of a specific type
   */
  getEventsByType(eventType: string, limit?: number): Promise<EventStoreEntry[]>;

  /**
   * Get events within a date range
   */
  getEventsByDateRange(fromDate: Date, toDate: Date): Promise<EventStoreEntry[]>;

  /**
   * Get the latest events
   */
  getLatestEvents(limit: number): Promise<EventStoreEntry[]>;

  /**
   * Get event store statistics
   */
  getStats(): Promise<EventStoreStats>;

  /**
   * Clear all events (use with caution)
   */
  clear(): Promise<void>;
}

/**
 * In-memory implementation of event store
 * Suitable for development and testing
 */
export class InMemoryEventStore implements IEventStore {
  private events: EventStoreEntry[] = [];
  private nextId = 1;

  async store(event: DomainEvent, metadata?: Record<string, any>): Promise<void> {
    const entry: EventStoreEntry = {
      id: this.nextId.toString(),
      event,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      eventVersion: event.version,
      occurredAt: event.occurredAt,
      storedAt: new Date(),
      metadata
    };

    this.events.push(entry);
    this.nextId++;
  }

  async storeMany(events: DomainEvent[], metadata?: Record<string, any>): Promise<void> {
    for (const event of events) {
      await this.store(event, metadata);
    }
  }

  async getEvents(query: EventQuery): Promise<EventStoreEntry[]> {
    let filtered = [...this.events];

    if (query.aggregateId) {
      filtered = filtered.filter(e => e.aggregateId === query.aggregateId);
    }

    if (query.eventType) {
      filtered = filtered.filter(e => e.eventType === query.eventType);
    }

    if (query.fromDate) {
      filtered = filtered.filter(e => e.occurredAt >= query.fromDate!);
    }

    if (query.toDate) {
      filtered = filtered.filter(e => e.occurredAt <= query.toDate!);
    }

    // Sort by occurrence time
    filtered.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || filtered.length;
    
    return filtered.slice(offset, offset + limit);
  }

  async getEventsForAggregate(aggregateId: string, fromVersion?: number): Promise<EventStoreEntry[]> {
    let filtered = this.events.filter(e => e.aggregateId === aggregateId);

    if (fromVersion !== undefined) {
      filtered = filtered.filter(e => e.eventVersion >= fromVersion);
    }

    return filtered.sort((a, b) => a.eventVersion - b.eventVersion);
  }

  async getEventsByType(eventType: string, limit?: number): Promise<EventStoreEntry[]> {
    const filtered = this.events.filter(e => e.eventType === eventType);
    
    // Sort by occurrence time (newest first for type queries)
    filtered.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    
    if (limit) {
      return filtered.slice(0, limit);
    }
    
    return filtered;
  }

  async getEventsByDateRange(fromDate: Date, toDate: Date): Promise<EventStoreEntry[]> {
    return this.getEvents({ fromDate, toDate });
  }

  async getLatestEvents(limit: number): Promise<EventStoreEntry[]> {
    return [...this.events]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit);
  }

  async getStats(): Promise<EventStoreStats> {
    const eventTypeDistribution: Record<string, number> = {};
    const uniqueAggregates = new Set<string>();
    let oldestEvent: Date | null = null;
    let newestEvent: Date | null = null;

    for (const entry of this.events) {
      // Count event types
      eventTypeDistribution[entry.eventType] = (eventTypeDistribution[entry.eventType] || 0) + 1;
      
      // Track unique aggregates
      uniqueAggregates.add(entry.aggregateId);
      
      // Track date range
      if (!oldestEvent || entry.occurredAt < oldestEvent) {
        oldestEvent = entry.occurredAt;
      }
      if (!newestEvent || entry.occurredAt > newestEvent) {
        newestEvent = entry.occurredAt;
      }
    }

    return {
      totalEvents: this.events.length,
      uniqueAggregates: uniqueAggregates.size,
      eventTypeDistribution,
      oldestEvent,
      newestEvent
    };
  }

  async clear(): Promise<void> {
    this.events = [];
    this.nextId = 1;
  }

  /**
   * Export events to JSON (useful for debugging and analysis)
   */
  exportToJson(): string {
    return JSON.stringify({
      events: this.events,
      exportedAt: new Date().toISOString(),
      totalCount: this.events.length
    }, null, 2);
  }

  /**
   * Import events from JSON (useful for testing and data migration)
   */
  async importFromJson(jsonData: string): Promise<void> {
    const data = JSON.parse(jsonData);
    if (data.events && Array.isArray(data.events)) {
      this.events = data.events;
      this.nextId = Math.max(...this.events.map(e => parseInt(e.id))) + 1;
    }
  }

  /**
   * Get event timeline for debugging
   */
  async getEventTimeline(aggregateId?: string): Promise<{
    timestamp: string;
    eventType: string;
    aggregateId: string;
    summary: string;
  }[]> {
    let eventsToProcess = aggregateId 
      ? this.events.filter(e => e.aggregateId === aggregateId)
      : this.events;

    return eventsToProcess
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .map(entry => ({
        timestamp: entry.occurredAt.toISOString(),
        eventType: entry.eventType,
        aggregateId: entry.aggregateId,
        summary: this.createEventSummary(entry)
      }));
  }

  private createEventSummary(entry: EventStoreEntry): string {
    // Create human-readable summaries for common events
    switch (entry.eventType) {
      case 'WorkflowStartedEvent':
        return `Workflow started with goal: ${(entry.event as any).goal || 'Unknown'}`;
      case 'WorkflowCompletedEvent':
        return `Workflow completed successfully`;
      case 'WorkflowFailedEvent':
        return `Workflow failed: ${(entry.event as any).reason || 'Unknown reason'}`;
      case 'TaskStartedEvent':
        return `Task started: ${(entry.event as any).description || 'No description'}`;
      case 'TaskCompletedEvent':
        return `Task completed successfully`;
      case 'TaskFailedEvent':
        return `Task failed: ${(entry.event as any).reason || 'Unknown reason'}`;
      default:
        return `${entry.eventType} occurred`;
    }
  }
}