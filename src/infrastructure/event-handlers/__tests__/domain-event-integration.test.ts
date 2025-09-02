/**
 * Domain Event Integration Tests
 * 
 */
import { 
  WorkflowEventBus,
  WorkflowEventBusFactory,
} from '../../../core/services/domain-event-bridge';
import { 
  WorkflowMetricsHandler,
  WorkflowLoggingHandler,
  LogLevel
} from '../index';
import {
  Workflow,
  Plan,
  Step,
  Task
} from '../../../core/entities';
import {
  WorkflowId,
  PlanId,
  StepId,
  TaskId,
  Variable,
  Url,
  Priority,
  Intent
} from '../../../core/value-objects';

// Mock legacy event bus
class MockLegacyEventBus {
  private events: Array<{ event: string; data: any }> = [];

  emit(event: string, data: any): void {
    this.events.push({ event, data });
  }

  on(event: string, callback: (data: any) => void): void {
    // Mock implementation - not used in these tests
  }

  getEmittedEvents(): Array<{ event: string; data: any }> {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

describe('Domain Event Integration', () => {
  let mockLegacyEventBus: MockLegacyEventBus;
  let workflowEventBus: WorkflowEventBus;
  let metricsHandler: WorkflowMetricsHandler;
  let loggingHandler: WorkflowLoggingHandler;

  beforeEach(() => {
    mockLegacyEventBus = new MockLegacyEventBus();
    workflowEventBus = WorkflowEventBusFactory.create(mockLegacyEventBus as any);
    metricsHandler = new WorkflowMetricsHandler();
    loggingHandler = new WorkflowLoggingHandler(false); // Disable console output for tests
    
    // Register event handlers
    workflowEventBus.registerDomainEventHandler(metricsHandler);
    workflowEventBus.registerDomainEventHandler(loggingHandler);
  });

  afterEach(() => {
    mockLegacyEventBus.clear();
    metricsHandler.resetMetrics();
    loggingHandler.clearLogs();
  });

  describe('Workflow Entity Events', () => {
    test('should generate and handle workflow started event', async () => {
      // Arrange
      const workflowId = WorkflowId.generate();
      const url = Url.create('https://example.com').getValue();
      const variables: Variable[] = [];
      
      const workflow = new Workflow(workflowId, 'Test workflow', url, variables);

      // Act
      const startResult = workflow.start();
      expect(startResult.isSuccess()).toBe(true);
      
      const domainEvents = workflow.getDomainEvents();
      expect(domainEvents.length).toBe(1);

      // Publish events
      await workflowEventBus.publishDomainEvents(domainEvents);
      workflow.clearDomainEvents();

      // Assert
      const metrics = metricsHandler.getMetrics();
      expect(metrics.totalWorkflows).toBe(1);
      
      const logs = loggingHandler.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].eventType).toBe('WorkflowStartedEvent');
      expect(logs[0].level).toBe(LogLevel.INFO);

      const legacyEvents = mockLegacyEventBus.getEmittedEvents();
      expect(legacyEvents.length).toBe(1);
      expect(legacyEvents[0].event).toBe('workflow:started');
    });

    test('should generate and handle workflow completed event', async () => {
      // Arrange
      const workflowId = WorkflowId.generate();
      const url = Url.create('https://example.com').getValue();
      const variables: Variable[] = [];
      
      const workflow = new Workflow(workflowId, 'Test workflow', url, variables);
      workflow.start();
      workflow.clearDomainEvents(); // Clear start event

      // Act
      const completeResult = workflow.complete('Test completed successfully', { result: 'success' });
      expect(completeResult.isSuccess()).toBe(true);
      
      const domainEvents = workflow.getDomainEvents();
      expect(domainEvents.length).toBe(1);

      // Publish events
      await workflowEventBus.publishDomainEvents(domainEvents);

      // Assert
      const metrics = metricsHandler.getMetrics();
      expect(metrics.completedWorkflows).toBe(1);
      
      const logs = loggingHandler.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].eventType).toBe('WorkflowCompletedEvent');
      expect(logs[0].level).toBe(LogLevel.INFO);

      const legacyEvents = mockLegacyEventBus.getEmittedEvents();
      expect(legacyEvents.length).toBe(1);
      expect(legacyEvents[0].event).toBe('workflow:completed');
    });

    test('should generate and handle workflow failed event', async () => {
      // Arrange
      const workflowId = WorkflowId.generate();
      const url = Url.create('https://example.com').getValue();
      const variables: Variable[] = [];
      
      const workflow = new Workflow(workflowId, 'Test workflow', url, variables);
      workflow.start();
      workflow.clearDomainEvents(); // Clear start event

      // Act
      const failResult = workflow.fail('Test failure reason');
      expect(failResult.isSuccess()).toBe(true);
      
      const domainEvents = workflow.getDomainEvents();
      expect(domainEvents.length).toBe(1);

      // Publish events
      await workflowEventBus.publishDomainEvents(domainEvents);

      // Assert
      const metrics = metricsHandler.getMetrics();
      expect(metrics.failedWorkflows).toBe(1);
      
      const logs = loggingHandler.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].eventType).toBe('WorkflowFailedEvent');
      expect(logs[0].level).toBe(LogLevel.ERROR);

      const legacyEvents = mockLegacyEventBus.getEmittedEvents();
      expect(legacyEvents.length).toBe(1);
      expect(legacyEvents[0].event).toBe('workflow:error');
    });
  });

  describe('Task Entity Events', () => {
    test('should generate and handle task lifecycle events', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const intent = Intent.create('click').getValue();
      const priority = Priority.medium();
      
      const task = new Task(taskId, intent, 'Test task', priority);

      // Act - Start task
      const executeResult = task.execute();
      expect(executeResult.isSuccess()).toBe(true);
      
      let domainEvents = task.getDomainEvents();
      await workflowEventBus.publishDomainEvents(domainEvents);
      task.clearDomainEvents();

      // Act - Complete task
      const taskResult = {
        taskId: taskId.toString(),
        success: true,
        confidence: 0.8,
        timestamp: new Date()
      };
      const completeResult = task.complete(taskResult);
      expect(completeResult.isSuccess()).toBe(true);
      
      domainEvents = task.getDomainEvents();
      await workflowEventBus.publishDomainEvents(domainEvents);

      // Assert
      const metrics = metricsHandler.getMetrics();
      expect(metrics.totalTasks).toBe(1);
      expect(metrics.completedTasks).toBe(1);
      
      const logs = loggingHandler.getLogs();
      expect(logs.length).toBe(2);
      expect(logs[0].eventType).toBe('TaskStartedEvent');
      expect(logs[1].eventType).toBe('TaskCompletedEvent');

      const legacyEvents = mockLegacyEventBus.getEmittedEvents();
      expect(legacyEvents.length).toBe(2);
      expect(legacyEvents[0].event).toBe('task:started');
      expect(legacyEvents[1].event).toBe('task:completed');
    });

    test('should handle task failure and retry events', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const intent = Intent.create('click').getValue();
      const priority = Priority.medium();
      
      const task = new Task(taskId, intent, 'Test task', priority, 2); // Allow 2 retries

      // Act - Start and fail task
      task.execute();
      task.clearDomainEvents(); // Clear start event
      
      const error = new Error('Test failure');
      const failResult = task.fail(error);
      expect(failResult.isSuccess()).toBe(true);
      expect(task.getStatus()).toBe('retrying'); // Should be retrying, not failed
      
      let domainEvents = task.getDomainEvents();
      await workflowEventBus.publishDomainEvents(domainEvents);
      task.clearDomainEvents();

      // Fail again to exceed retries
      task.execute();
      task.clearDomainEvents();
      const finalFailResult = task.fail(error);
      expect(finalFailResult.isSuccess()).toBe(true);
      expect(task.getStatus()).toBe('retrying'); // Still retrying after first retry

      domainEvents = task.getDomainEvents();
      await workflowEventBus.publishDomainEvents(domainEvents);

      // Assert
      const metrics = metricsHandler.getMetrics();
      expect(metrics.retriedTasks).toBe(2); // Two retry events
      
      const logs = loggingHandler.getLogs();
      const retryLogs = logs.filter(log => log.eventType === 'TaskRetriedEvent');
      expect(retryLogs.length).toBe(2);
    });
  });

  describe('Plan Entity Events', () => {
    test('should generate and handle plan created event', async () => {
      // Arrange
      const planId = PlanId.generate();
      const workflowId = WorkflowId.generate();
      const stepId = StepId.generate();
      
      const step = new Step(stepId, 'Test step', 'Test description', 1, workflowId);
      
      // Act
      const planResult = Plan.create(planId, workflowId, [step]);
      expect(planResult.isSuccess()).toBe(true);
      
      const plan = planResult.getValue();
      const domainEvents = plan.getDomainEvents();
      await workflowEventBus.publishDomainEvents(domainEvents);

      // Assert
      const logs = loggingHandler.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].eventType).toBe('PlanCreatedEvent');
      expect(logs[0].level).toBe(LogLevel.INFO);

      // Plan created event doesn't map to a legacy event currently
      const legacyEvents = mockLegacyEventBus.getEmittedEvents();
      expect(legacyEvents.length).toBe(1);
      expect(legacyEvents[0].event).toBe('replan:triggered'); // Maps to replan event
    });
  });

  describe('Metrics Collection', () => {
    test('should collect comprehensive workflow metrics', async () => {
      // Arrange - Create multiple workflows with different outcomes
      const workflows = [];
      for (let i = 0; i < 5; i++) {
        const workflowId = WorkflowId.generate();
        const url = Url.create('https://example.com').getValue();
        const workflow = new Workflow(workflowId, `Test workflow ${i}`, url, []);
        workflows.push(workflow);
      }

      // Act - Complete some workflows, fail others
      for (let i = 0; i < workflows.length; i++) {
        const workflow = workflows[i];
        workflow.start();
        
        if (i < 3) {
          workflow.complete('Success', {});
        } else {
          workflow.fail('Failed');
        }
        
        const events = workflow.getDomainEvents();
        await workflowEventBus.publishDomainEvents(events);
      }

      // Assert
      const metrics = metricsHandler.getMetrics();
      expect(metrics.totalWorkflows).toBe(5);
      expect(metrics.completedWorkflows).toBe(3);
      expect(metrics.failedWorkflows).toBe(2);
      expect(metrics.workflowSuccessRate).toBe(60); // 3/5 * 100
      
      const detailedStats = metricsHandler.getDetailedStats();
      expect(detailedStats.workflowDurationStats.min).toBeGreaterThanOrEqual(0);
      expect(detailedStats.workflowDurationStats.max).toBeGreaterThanOrEqual(0);
    });

    test('should export metrics in JSON format', async () => {
      // Arrange
      const workflowId = WorkflowId.generate();
      const url = Url.create('https://example.com').getValue();
      const workflow = new Workflow(workflowId, 'Test workflow', url, []);
      
      workflow.start();
      workflow.complete('Success', {});
      
      const events = workflow.getDomainEvents();
      await workflowEventBus.publishDomainEvents(events);

      // Act
      const exportedMetrics = metricsHandler.exportMetrics();
      const parsedMetrics = JSON.parse(exportedMetrics);

      // Assert
      expect(parsedMetrics).toHaveProperty('metrics');
      expect(parsedMetrics).toHaveProperty('detailedStats');
      expect(parsedMetrics).toHaveProperty('exportedAt');
      expect(parsedMetrics.metrics.totalWorkflows).toBe(1);
      expect(parsedMetrics.metrics.completedWorkflows).toBe(1);
    });
  });

  describe('Logging Functionality', () => {
    test('should create structured logs for all events', async () => {
      // Arrange
      const workflowId = WorkflowId.generate();
      const url = Url.create('https://example.com').getValue();
      const workflow = new Workflow(workflowId, 'Test workflow', url, []);

      // Act
      workflow.start();
      workflow.complete('Test completed', { data: 'test' });
      
      const events = workflow.getDomainEvents();
      await workflowEventBus.publishDomainEvents(events);

      // Assert
      const logs = loggingHandler.getLogs();
      expect(logs.length).toBe(2);
      
      const startLog = logs[0];
      expect(startLog.level).toBe(LogLevel.INFO);
      expect(startLog.eventType).toBe('WorkflowStartedEvent');
      expect(startLog.aggregateId).toBe(workflowId.toString());
      expect(startLog.message).toContain('Test workflow');
      
      const completeLog = logs[1];
      expect(completeLog.level).toBe(LogLevel.INFO);
      expect(completeLog.eventType).toBe('WorkflowCompletedEvent');
      expect(completeLog.message).toContain('Test completed');
    });

    test('should filter logs by various criteria', async () => {
      // Arrange - Create events with different types and levels
      const workflowId = WorkflowId.generate();
      const url = Url.create('https://example.com').getValue();
      const workflow = new Workflow(workflowId, 'Test workflow', url, []);
      
      workflow.start();
      workflow.fail('Test failure');
      
      const events = workflow.getDomainEvents();
      await workflowEventBus.publishDomainEvents(events);

      // Act & Assert - Filter by level
      const errorLogs = loggingHandler.getLogsByLevel(LogLevel.ERROR);
      expect(errorLogs.length).toBe(1);
      expect(errorLogs[0].eventType).toBe('WorkflowFailedEvent');
      
      const infoLogs = loggingHandler.getLogsByLevel(LogLevel.INFO);
      expect(infoLogs.length).toBe(1);
      expect(infoLogs[0].eventType).toBe('WorkflowStartedEvent');

      // Act & Assert - Filter by event type
      const failedEventLogs = loggingHandler.getLogsByEventType('WorkflowFailedEvent');
      expect(failedEventLogs.length).toBe(1);

      // Act & Assert - Filter by aggregate ID
      const workflowLogs = loggingHandler.getLogsByAggregateId(workflowId.toString());
      expect(workflowLogs.length).toBe(2);
    });

    test('should export logs in multiple formats', async () => {
      // Arrange
      const workflowId = WorkflowId.generate();
      const url = Url.create('https://example.com').getValue();
      const workflow = new Workflow(workflowId, 'Test workflow', url, []);
      
      workflow.start();
      const events = workflow.getDomainEvents();
      await workflowEventBus.publishDomainEvents(events);

      // Act & Assert - JSON export
      const jsonExport = loggingHandler.exportLogs();
      const parsedLogs = JSON.parse(jsonExport);
      expect(parsedLogs).toHaveProperty('logs');
      expect(parsedLogs.logs.length).toBe(1);

      // Act & Assert - CSV export
      const csvExport = loggingHandler.exportLogsToCSV();
      expect(csvExport).toContain('timestamp,level,eventType,aggregateId,message');
      expect(csvExport).toContain('WorkflowStartedEvent');

      // Act & Assert - Summary
      const summary = loggingHandler.getLogSummary();
      expect(summary.totalLogs).toBe(1);
      expect(summary.logsByEventType['WorkflowStartedEvent']).toBe(1);
      expect(summary.logsByLevel[LogLevel.INFO]).toBe(1);
    });
  });

  describe('Event Bus Bridge', () => {
    test('should bridge domain events to legacy events correctly', async () => {
      // Arrange
      const workflowId = WorkflowId.generate();
      const url = Url.create('https://example.com').getValue();
      const workflow = new Workflow(workflowId, 'Test workflow', url, []);

      // Act - Generate various workflow events
      workflow.start();
      workflow.complete('Test completed', {});
      
      const events = workflow.getDomainEvents();
      await workflowEventBus.publishDomainEvents(events);

      // Assert
      const legacyEvents = mockLegacyEventBus.getEmittedEvents();
      expect(legacyEvents.length).toBe(2);
      
      expect(legacyEvents[0].event).toBe('workflow:started');
      expect(legacyEvents[0].data.workflowId).toBe(workflowId.toString());
      
      expect(legacyEvents[1].event).toBe('workflow:completed');
      expect(legacyEvents[1].data.workflowId).toBe(workflowId.toString());
    });

    test('should handle task events correctly', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const intent = Intent.create('click').getValue();
      const priority = Priority.medium();
      const task = new Task(taskId, intent, 'Test task', priority);

      // Act
      task.execute();
      task.complete({
        taskId: taskId.toString(),
        success: true,
        confidence: 0.8,
        timestamp: new Date()
      });
      
      const events = task.getDomainEvents();
      await workflowEventBus.publishDomainEvents(events);

      // Assert
      const legacyEvents = mockLegacyEventBus.getEmittedEvents();
      expect(legacyEvents.length).toBe(2);
      
      expect(legacyEvents[0].event).toBe('task:started');
      expect(legacyEvents[0].data.taskId).toBe(taskId.toString());
      
      expect(legacyEvents[1].event).toBe('task:completed');
      expect(legacyEvents[1].data.taskId).toBe(taskId.toString());
    });
  });
});