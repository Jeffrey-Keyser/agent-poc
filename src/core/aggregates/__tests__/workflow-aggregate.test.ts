import { WorkflowAggregate, StepExecutionResult } from '../workflow-aggregate';
import { Workflow, Plan, Step, Task, Session, Result } from '../../entities';
import { 
  WorkflowId, 
  PlanId, 
  StepId, 
  TaskId, 
  SessionId,
  Url, 
  Confidence, 
  Priority, 
  Intent,
  Viewport 
} from '../../value-objects';

describe('WorkflowAggregate', () => {
  let workflow: Workflow;
  let plan: Plan;
  let session: Session;
  let workflowAggregate: WorkflowAggregate;

  beforeEach(() => {
    // Create test entities
    const workflowId = WorkflowId.generate();
    const url = Url.create('https://example.com').getValue();
    
    workflow = new Workflow(workflowId, 'Test workflow', url, []);
    
    // Create a step with a task
    const stepId = StepId.generate();
    const confidence = Confidence.create(80).getValue();
    const step = Step.create(stepId, 'Test step', 1, confidence).getValue();
    
    const taskId = TaskId.generate();
    const intent = Intent.create('click').getValue();
    const priority = Priority.medium();
    const task = Task.create(taskId, intent, 'Click test', priority, 3, 30000).getValue();
    step.addTask(task);
    
    const planId = PlanId.generate();
    plan = Plan.create(planId, workflowId, [step]).getValue();
    
    const sessionId = SessionId.generate();
    const viewport = Viewport.create(1920, 1080).getValue();
    session = Session.create(sessionId, workflowId, viewport).getValue();
  });

  describe('create', () => {
    it('should create workflow aggregate successfully', () => {
      const result = WorkflowAggregate.create(workflow, plan, session);
      
      expect(result.isSuccess()).toBe(true);
      expect(result.getValue()).toBeInstanceOf(WorkflowAggregate);
    });

    it('should fail if plan does not belong to workflow', () => {
      const otherWorkflowId = WorkflowId.generate();
      const otherPlanId = PlanId.generate();
      const invalidPlan = Plan.create(otherPlanId, otherWorkflowId, []).getValue();
      
      const result = WorkflowAggregate.create(workflow, invalidPlan, session);
      
      expect(result.isFailure()).toBe(true);
      expect(result.getError()).toContain('Plan does not belong to the workflow');
    });

    it('should fail if session does not belong to workflow', () => {
      const otherWorkflowId = WorkflowId.generate();
      const otherSessionId = SessionId.generate();
      const viewport = Viewport.create(1920, 1080).getValue();
      const invalidSession = Session.create(otherSessionId, otherWorkflowId, viewport).getValue();
      
      const result = WorkflowAggregate.create(workflow, plan, invalidSession);
      
      expect(result.isFailure()).toBe(true);
      expect(result.getError()).toContain('Session does not belong to the workflow');
    });

    it('should fail if workflow is already completed', () => {
      workflow.start();
      workflow.complete('Already completed', {});
      
      const result = WorkflowAggregate.create(workflow, plan, session);
      
      expect(result.isFailure()).toBe(true);
      expect(result.getError()).toContain('Cannot create aggregate for completed or failed workflow');
    });
  });

  describe('startExecution', () => {
    beforeEach(() => {
      workflowAggregate = WorkflowAggregate.create(workflow, plan, session).getValue();
    });

    it('should start execution successfully', () => {
      const result = workflowAggregate.startExecution();
      
      expect(result.isSuccess()).toBe(true);
      expect(workflow.isRunning()).toBe(true);
    });

    it('should fail if session is not active', () => {
      session.end();
      
      const result = workflowAggregate.startExecution();
      
      expect(result.isFailure()).toBe(true);
      expect(result.getError()).toContain('Session is not active');
    });
  });

  describe('executeNextStep', () => {
    beforeEach(() => {
      workflowAggregate = WorkflowAggregate.create(workflow, plan, session).getValue();
      workflowAggregate.startExecution();
    });

    it('should execute next step successfully', () => {
      const result = workflowAggregate.executeNextStep();
      
      expect(result.isSuccess()).toBe(true);
      
      const stepResult = result.getValue();
      expect(stepResult).toBeInstanceOf(StepExecutionResult);
      expect(stepResult.success).toBe(true);
      expect(stepResult.getTaskCount()).toBe(1);
    });

    it('should fail if workflow is not running', () => {
      workflow.fail('Test failure');
      
      const result = workflowAggregate.executeNextStep();
      
      expect(result.isFailure()).toBe(true);
      expect(result.getError()).toContain('Workflow is not in running state');
    });

    it('should fail if session is not active', () => {
      session.end();
      
      const result = workflowAggregate.executeNextStep();
      
      expect(result.isFailure()).toBe(true);
      expect(result.getError()).toContain('Session is not active');
    });
  });

  describe('getExecutionStatus', () => {
    beforeEach(() => {
      workflowAggregate = WorkflowAggregate.create(workflow, plan, session).getValue();
      workflowAggregate.startExecution();
    });

    it('should return execution status', () => {
      const status = workflowAggregate.getExecutionStatus();
      
      expect(status).toHaveProperty('workflowStatus');
      expect(status).toHaveProperty('sessionStatus');
      expect(status).toHaveProperty('currentStepIndex');
      expect(status).toHaveProperty('totalSteps');
      expect(status).toHaveProperty('completionPercentage');
      expect(status).toHaveProperty('isHealthy');
      
      expect(status.workflowStatus).toBe('running');
      expect(status.totalSteps).toBe(1);
      expect(status.isHealthy).toBe(true);
    });
  });

  describe('completeExecution', () => {
    beforeEach(() => {
      workflowAggregate = WorkflowAggregate.create(workflow, plan, session).getValue();
      workflowAggregate.startExecution();
    });

    it('should complete execution successfully', () => {
      const result = workflowAggregate.completeExecution('Test completion', { data: 'test' });
      
      expect(result.isSuccess()).toBe(true);
      expect(workflow.isComplete()).toBe(true);
      expect(session.isActive()).toBe(false);
    });
  });

  describe('failExecution', () => {
    beforeEach(() => {
      workflowAggregate = WorkflowAggregate.create(workflow, plan, session).getValue();
      workflowAggregate.startExecution();
    });

    it('should fail execution successfully', () => {
      const result = workflowAggregate.failExecution('Test failure');
      
      expect(result.isSuccess()).toBe(true);
      expect(workflow.isFailed()).toBe(true);
    });
  });

  describe('invariants', () => {
    it('should validate aggregate consistency on creation', () => {
      const otherWorkflowId = WorkflowId.generate();
      const otherPlanId = PlanId.generate();
      const invalidPlan = Plan.create(otherPlanId, otherWorkflowId, []).getValue();
      
      expect(() => {
        new (WorkflowAggregate as any)(workflow, invalidPlan, session);
      }).toThrow('Plan workflow ID must match workflow ID');
    });

    it('should validate invariants during execution', () => {
      workflowAggregate = WorkflowAggregate.create(workflow, plan, session).getValue();
      workflowAggregate.startExecution();
      
      // Force workflow to complete without completing plan (invalid state)
      workflow.complete('Forced completion', {});
      
      // This should throw when validateInvariants is called
      expect(() => {
        workflowAggregate.executeNextStep();
      }).toThrow();
    });
  });
});