import { ExecutionAggregate, ExecutionStatistics } from '../execution-aggregate';
import { ExecutionContext, ExecutionResult, Task, Result } from '../../entities';
import { 
  WorkflowId, 
  TaskId, 
  Intent, 
  Priority, 
  Url, 
  Viewport,
  Evidence,
  PageState
} from '../../value-objects';

describe('ExecutionAggregate', () => {
  let executionContext: ExecutionContext;
  let executionAggregate: ExecutionAggregate;
  let task: Task;

  beforeEach(() => {
    const workflowId = WorkflowId.generate();
    const url = Url.create('https://example.com').getValue();
    const viewport = Viewport.create(1920, 1080).getValue();
    
    executionContext = ExecutionContext.create(workflowId, url, viewport).getValue();
    
    const taskId = TaskId.generate();
    const intent = Intent.create('click').getValue();
    const priority = Priority.medium();
    task = Task.create(taskId, intent, 'Test task', priority, 3, 30000).getValue();
  });

  describe('create', () => {
    it('should create execution aggregate successfully', () => {
      const result = ExecutionAggregate.create(executionContext);
      
      expect(result.isSuccess()).toBe(true);
      expect(result.getValue()).toBeInstanceOf(ExecutionAggregate);
    });

    it('should fail if execution context is not ready', () => {
      // Create a context that's not ready (mock implementation)
      const notReadyContext = {
        ...executionContext,
        isReady: () => false
      } as ExecutionContext;
      
      const result = ExecutionAggregate.create(notReadyContext);
      
      expect(result.isFailure()).toBe(true);
      expect(result.getError()).toContain('Execution context is not ready');
    });
  });

  describe('fromExistingData', () => {
    it('should create aggregate from existing results', () => {
      const taskResult = {
        taskId: task.getId().toString(),
        success: true,
        duration: 1000,
        timestamp: new Date()
      };

      const executionResult = ExecutionResult.create(
        task.getId(),
        taskResult,
        undefined,
        'test context',
        0
      ).getValue();

      const result = ExecutionAggregate.fromExistingData(executionContext, [executionResult]);
      
      expect(result.isSuccess()).toBe(true);
      
      const aggregate = result.getValue();
      expect(aggregate.getResultCount()).toBe(1);
    });
  });

  describe('startTaskExecution', () => {
    beforeEach(() => {
      executionAggregate = ExecutionAggregate.create(executionContext).getValue();
    });

    it('should start task execution successfully', () => {
      const result = executionAggregate.startTaskExecution(task);
      
      expect(result.isSuccess()).toBe(true);
      expect(task.getStatus()).toBe('running');
    });
  });

  describe('recordExecution', () => {
    beforeEach(() => {
      executionAggregate = ExecutionAggregate.create(executionContext).getValue();
      task.execute(); // Set task to running state
    });

    it('should record successful execution', () => {
      const taskResult = {
        taskId: task.getId().toString(),
        success: true,
        duration: 1000,
        timestamp: new Date()
      };

      const evidence = Evidence.create('test evidence', 'screenshot', new Date()).getValue();
      
      const result = executionAggregate.recordExecution(task, taskResult, evidence, 'test context');
      
      expect(result.isSuccess()).toBe(true);
      expect(executionAggregate.getResultCount()).toBe(1);
      
      const executionResult = result.getValue();
      expect(executionResult.isSuccess()).toBe(true);
    });

    it('should record failed execution', () => {
      const taskResult = {
        taskId: task.getId().toString(),
        success: false,
        duration: 1000,
        timestamp: new Date(),
        error: 'Test failure'
      };

      const result = executionAggregate.recordExecution(task, taskResult);
      
      expect(result.isSuccess()).toBe(true);
      expect(executionAggregate.getResultCount()).toBe(1);
      
      const executionResult = result.getValue();
      expect(executionResult.isFailure()).toBe(true);
    });

    it('should fail if task is not in correct state', () => {
      // Create a new task that's not running
      const newTaskId = TaskId.generate();
      const newIntent = Intent.create('type').getValue();
      const newTask = Task.create(newTaskId, newIntent, 'New task', Priority.low(), 3, 30000).getValue();
      
      const taskResult = {
        taskId: newTask.getId().toString(),
        success: true,
        duration: 1000,
        timestamp: new Date()
      };

      const result = executionAggregate.recordExecution(newTask, taskResult);
      
      expect(result.isFailure()).toBe(true);
      expect(result.getError()).toContain('Task must be running or completed to record result');
    });
  });

  describe('query operations', () => {
    beforeEach(() => {
      executionAggregate = ExecutionAggregate.create(executionContext).getValue();
      task.execute();
    });

    it('should get successful executions', () => {
      // Add successful execution
      const successResult = {
        taskId: task.getId().toString(),
        success: true,
        duration: 1000,
        timestamp: new Date()
      };
      executionAggregate.recordExecution(task, successResult);

      const successfulExecutions = executionAggregate.getSuccessfulExecutions();
      expect(successfulExecutions.length).toBe(1);
    });

    it('should get failed executions', () => {
      // Add failed execution
      const failResult = {
        taskId: task.getId().toString(),
        success: false,
        duration: 1000,
        timestamp: new Date(),
        error: 'Test error'
      };
      executionAggregate.recordExecution(task, failResult);

      const failedExecutions = executionAggregate.getFailedExecutions();
      expect(failedExecutions.length).toBe(1);
    });

    it('should get executions by task ID', () => {
      const taskResult = {
        taskId: task.getId().toString(),
        success: true,
        duration: 1000,
        timestamp: new Date()
      };
      executionAggregate.recordExecution(task, taskResult);

      const taskExecutions = executionAggregate.getExecutionsByTaskId(task.getId());
      expect(taskExecutions.length).toBe(1);
    });

    it('should get executions by time range', () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 60000); // 1 minute ago
      const later = new Date(now.getTime() + 60000); // 1 minute from now

      const taskResult = {
        taskId: task.getId().toString(),
        success: true,
        duration: 1000,
        timestamp: now
      };
      executionAggregate.recordExecution(task, taskResult);

      const executions = executionAggregate.getExecutionsByTimeRange(earlier, later);
      expect(executions.length).toBe(1);
    });

    it('should get recent executions', () => {
      const taskResult = {
        taskId: task.getId().toString(),
        success: true,
        duration: 1000,
        timestamp: new Date()
      };
      executionAggregate.recordExecution(task, taskResult);

      const recentExecutions = executionAggregate.getRecentExecutions(5);
      expect(recentExecutions.length).toBe(1);
    });

    it('should get slow executions', () => {
      const slowResult = {
        taskId: task.getId().toString(),
        success: true,
        duration: 10000, // 10 seconds - slow
        timestamp: new Date()
      };
      executionAggregate.recordExecution(task, slowResult);

      const slowExecutions = executionAggregate.getSlowExecutions(5000);
      expect(slowExecutions.length).toBe(1);
    });

    it('should get fast executions', () => {
      const fastResult = {
        taskId: task.getId().toString(),
        success: true,
        duration: 500, // 0.5 seconds - fast
        timestamp: new Date()
      };
      executionAggregate.recordExecution(task, fastResult);

      const fastExecutions = executionAggregate.getFastExecutions(1000);
      expect(fastExecutions.length).toBe(1);
    });
  });

  describe('getExecutionStatistics', () => {
    beforeEach(() => {
      executionAggregate = ExecutionAggregate.create(executionContext).getValue();
      task.execute();
    });

    it('should calculate execution statistics', () => {
      // Add multiple executions
      const results = [
        { success: true, duration: 1000 },
        { success: false, duration: 2000 },
        { success: true, duration: 500 }
      ];

      results.forEach((result, index) => {
        const taskResult = {
          taskId: task.getId().toString(),
          success: result.success,
          duration: result.duration,
          timestamp: new Date(),
          ...(result.success ? {} : { error: 'Test error' })
        };
        executionAggregate.recordExecution(task, taskResult);
      });

      const stats = executionAggregate.getExecutionStatistics();
      
      expect(stats.totalExecutions).toBe(3);
      expect(stats.successfulExecutions).toBe(2);
      expect(stats.failedExecutions).toBe(1);
      expect(stats.successRate).toBeCloseTo(2/3, 2);
      expect(stats.averageDuration).toBeCloseTo(1166.67, 1);
    });

    it('should return zero statistics for no executions', () => {
      const stats = executionAggregate.getExecutionStatistics();
      
      expect(stats.totalExecutions).toBe(0);
      expect(stats.successfulExecutions).toBe(0);
      expect(stats.failedExecutions).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.averageDuration).toBe(0);
    });
  });

  describe('performance analysis', () => {
    beforeEach(() => {
      executionAggregate = ExecutionAggregate.create(executionContext).getValue();
      task.execute();
    });

    it('should detect good performance', () => {
      // Add good performance data
      for (let i = 0; i < 5; i++) {
        const taskResult = {
          taskId: task.getId().toString(),
          success: true,
          duration: 1000, // Fast
          timestamp: new Date()
        };
        executionAggregate.recordExecution(task, taskResult);
      }

      expect(executionAggregate.isPerformingWell()).toBe(true);
      expect(executionAggregate.needsOptimization()).toBe(false);
    });

    it('should detect poor performance', () => {
      // Add poor performance data
      for (let i = 0; i < 10; i++) {
        const taskResult = {
          taskId: task.getId().toString(),
          success: i < 3, // 30% success rate
          duration: 15000, // Very slow
          timestamp: new Date(),
          ...(i >= 3 ? { error: 'Test error' } : {})
        };
        executionAggregate.recordExecution(task, taskResult);
      }

      expect(executionAggregate.isPerformingWell()).toBe(false);
      expect(executionAggregate.needsOptimization()).toBe(true);
    });
  });

  describe('data export', () => {
    beforeEach(() => {
      executionAggregate = ExecutionAggregate.create(executionContext).getValue();
      task.execute();
    });

    it('should export execution data', () => {
      const taskResult = {
        taskId: task.getId().toString(),
        success: true,
        duration: 1000,
        timestamp: new Date()
      };
      executionAggregate.recordExecution(task, taskResult);

      const exportData = executionAggregate.exportExecutionData();
      
      expect(exportData).toHaveProperty('context');
      expect(exportData).toHaveProperty('statistics');
      expect(exportData).toHaveProperty('executionHistory');
      expect(exportData).toHaveProperty('performance');
      
      expect(exportData.executionHistory).toHaveLength(1);
      expect(exportData.statistics.totalExecutions).toBe(1);
    });
  });

  describe('context updates', () => {
    beforeEach(() => {
      executionAggregate = ExecutionAggregate.create(executionContext).getValue();
    });

    it('should update current URL', () => {
      const newUrl = Url.create('https://newexample.com').getValue();
      
      const result = executionAggregate.updateCurrentUrl(newUrl);
      
      expect(result.isSuccess()).toBe(true);
    });

    it('should update page state', () => {
      const pageState = PageState.create(
        ['main', 'nav'],
        ['button', 'input'],
        { key: 'value' }
      ).getValue();
      
      const result = executionAggregate.updatePageState(pageState);
      
      expect(result.isSuccess()).toBe(true);
    });

    it('should update viewport', () => {
      const viewport = Viewport.create(1024, 768).getValue();
      
      const result = executionAggregate.updateViewport(viewport);
      
      expect(result.isSuccess()).toBe(true);
    });
  });
});