import { InMemoryPlanRepository } from '../in-memory-plan-repository';
import { Plan, Step } from '../../../core/entities';
import { PlanId, WorkflowId, StepId, TaskId, Priority, Intent, Confidence } from '../../../core/value-objects';

describe('InMemoryPlanRepository', () => {
  let repository: InMemoryPlanRepository;
  let samplePlan: Plan;
  let planId: PlanId;
  let workflowId: WorkflowId;

  beforeEach(() => {
    repository = new InMemoryPlanRepository();
    planId = PlanId.generate();
    workflowId = WorkflowId.generate();
    
    // Create a sample plan with steps
    const step1 = new Step(
      StepId.generate(),
      planId,
      'First step description',
      Confidence.high(),
      1
    );
    const step2 = new Step(
      StepId.generate(),
      planId,
      'Second step description',
      Confidence.medium(),
      2
    );
    
    samplePlan = Plan.create(planId, workflowId, [step1, step2]).getValue();
  });

  afterEach(async () => {
    await repository.clear();
  });

  describe('save', () => {
    it('should save a plan successfully', async () => {
      await expect(repository.save(samplePlan)).resolves.not.toThrow();
      
      const retrieved = await repository.findById(planId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.getId().equals(planId)).toBe(true);
      expect(retrieved!.getWorkflowId().equals(workflowId)).toBe(true);
      expect(retrieved!.getSteps()).toHaveLength(2);
    });

    it('should throw error when saving plan with existing ID', async () => {
      await repository.save(samplePlan);
      
      await expect(repository.save(samplePlan))
        .rejects.toThrow('Plan with ID');
    });
  });

  describe('findById', () => {
    it('should return plan when found', async () => {
      await repository.save(samplePlan);
      
      const result = await repository.findById(planId);
      expect(result).toBeDefined();
      expect(result!.getId().equals(planId)).toBe(true);
      expect(result!.getSteps()).toHaveLength(2);
    });

    it('should return undefined when plan not found', async () => {
      const nonExistentId = PlanId.generate();
      
      const result = await repository.findById(nonExistentId);
      expect(result).toBeUndefined();
    });
  });

  describe('findByWorkflowId', () => {
    it('should return plans for specific workflow', async () => {
      const anotherWorkflowId = WorkflowId.generate();
      const anotherPlan = Plan.create(
        PlanId.generate(),
        anotherWorkflowId,
        []
      ).getValue();
      
      await repository.save(samplePlan);
      await repository.save(anotherPlan);
      
      const workflowPlans = await repository.findByWorkflowId(workflowId);
      expect(workflowPlans).toHaveLength(1);
      expect(workflowPlans[0].getId().equals(planId)).toBe(true);
      
      const otherWorkflowPlans = await repository.findByWorkflowId(anotherWorkflowId);
      expect(otherWorkflowPlans).toHaveLength(1);
      expect(otherWorkflowPlans[0].getWorkflowId().equals(anotherWorkflowId)).toBe(true);
    });

    it('should return empty array when no plans for workflow', async () => {
      const nonExistentWorkflowId = WorkflowId.generate();
      
      const plans = await repository.findByWorkflowId(nonExistentWorkflowId);
      expect(plans).toHaveLength(0);
    });

    it('should sort plans by creation date (most recent first)', async () => {
      const plan1 = Plan.create(PlanId.generate(), workflowId, []).getValue();
      const plan2 = Plan.create(PlanId.generate(), workflowId, []).getValue();
      
      // Add delay to ensure different timestamps
      await repository.save(plan1);
      await new Promise(resolve => setTimeout(resolve, 10));
      await repository.save(plan2);
      
      const plans = await repository.findByWorkflowId(workflowId);
      expect(plans).toHaveLength(2);
      
      // Should be sorted by creation date (most recent first)
      if (plans[0].getCreatedAt && plans[1].getCreatedAt) {
        expect(plans[0].getCreatedAt().getTime()).toBeGreaterThanOrEqual(
          plans[1].getCreatedAt().getTime()
        );
      }
    });
  });

  describe('update', () => {
    it('should update existing plan successfully', async () => {
      await repository.save(samplePlan);
      
      // Modify the plan (add a task to a step)
      const steps = samplePlan.getSteps();
      if (steps.length > 0) {
        const task = {
          id: TaskId.generate(),
          intent: Intent.create('click').getValue(),
          description: 'Click a button',
          priority: Priority.medium()
        };
        steps[0].addTask(task);
      }
      
      await expect(repository.update(samplePlan)).resolves.not.toThrow();
      
      const retrieved = await repository.findById(planId);
      expect(retrieved).toBeDefined();
    });

    it('should throw error when updating non-existent plan', async () => {
      await expect(repository.update(samplePlan))
        .rejects.toThrow('Plan with ID');
    });
  });

  describe('delete', () => {
    it('should delete existing plan successfully', async () => {
      await repository.save(samplePlan);
      
      await expect(repository.delete(planId)).resolves.not.toThrow();
      
      const retrieved = await repository.findById(planId);
      expect(retrieved).toBeUndefined();
    });

    it('should throw error when deleting non-existent plan', async () => {
      const nonExistentId = PlanId.generate();
      
      await expect(repository.delete(nonExistentId))
        .rejects.toThrow('Plan with ID');
    });
  });

  describe('findLatestByWorkflowId', () => {
    it('should return most recent plan for workflow', async () => {
      const plan1 = Plan.create(PlanId.generate(), workflowId, []).getValue();
      const plan2 = Plan.create(PlanId.generate(), workflowId, []).getValue();
      
      await repository.save(plan1);
      await new Promise(resolve => setTimeout(resolve, 10));
      await repository.save(plan2);
      
      const latest = await repository.findLatestByWorkflowId(workflowId);
      expect(latest).toBeDefined();
      expect(latest!.getId().equals(plan2.getId())).toBe(true);
    });

    it('should return undefined when no plans for workflow', async () => {
      const nonExistentWorkflowId = WorkflowId.generate();
      
      const latest = await repository.findLatestByWorkflowId(nonExistentWorkflowId);
      expect(latest).toBeUndefined();
    });
  });

  describe('findByStepCount', () => {
    it('should find plans with step count in range', async () => {
      const planWith1Step = Plan.create(
        PlanId.generate(),
        WorkflowId.generate(),
        [new Step(StepId.generate(), PlanId.generate(), 'Step 1', Confidence.high(), 1)]
      ).getValue();
      
      const planWith3Steps = Plan.create(
        PlanId.generate(),
        WorkflowId.generate(),
        [
          new Step(StepId.generate(), PlanId.generate(), 'Step 1', Confidence.high(), 1),
          new Step(StepId.generate(), PlanId.generate(), 'Step 2', Confidence.high(), 2),
          new Step(StepId.generate(), PlanId.generate(), 'Step 3', Confidence.high(), 3)
        ]
      ).getValue();
      
      await repository.save(samplePlan); // 2 steps
      await repository.save(planWith1Step);
      await repository.save(planWith3Steps);
      
      // Find plans with 2-3 steps
      const plans2to3 = await repository.findByStepCount(2, 3);
      expect(plans2to3).toHaveLength(2);
      
      // Find plans with exactly 1 step
      const plans1 = await repository.findByStepCount(1, 1);
      expect(plans1).toHaveLength(1);
      
      // Find plans with at least 2 steps
      const plansMin2 = await repository.findByStepCount(2);
      expect(plansMin2).toHaveLength(2);
    });
  });

  describe('count', () => {
    it('should return correct count', async () => {
      expect(await repository.count()).toBe(0);
      
      await repository.save(samplePlan);
      expect(await repository.count()).toBe(1);
      
      const anotherPlan = Plan.create(
        PlanId.generate(),
        WorkflowId.generate(),
        []
      ).getValue();
      await repository.save(anotherPlan);
      expect(await repository.count()).toBe(2);
    });
  });

  describe('findByCompletionStatus', () => {
    it('should find plans by completion status', async () => {
      const completedPlan = Plan.create(PlanId.generate(), workflowId, []).getValue();
      completedPlan.markAsComplete();
      
      await repository.save(samplePlan); // incomplete
      await repository.save(completedPlan); // completed
      
      const incomplete = await repository.findByCompletionStatus(false);
      expect(incomplete).toHaveLength(1);
      expect(incomplete[0].getId().equals(samplePlan.getId())).toBe(true);
      
      const completed = await repository.findByCompletionStatus(true);
      expect(completed).toHaveLength(1);
      expect(completed[0].getId().equals(completedPlan.getId())).toBe(true);
    });
  });

  describe('findByStepDescription', () => {
    it('should find plans containing steps with matching descriptions', async () => {
      const plan1 = Plan.create(
        PlanId.generate(),
        WorkflowId.generate(),
        [new Step(StepId.generate(), PlanId.generate(), 'Navigate to login page', Confidence.high(), 1)]
      ).getValue();
      
      const plan2 = Plan.create(
        PlanId.generate(),
        WorkflowId.generate(),
        [new Step(StepId.generate(), PlanId.generate(), 'Search for products', Confidence.high(), 1)]
      ).getValue();
      
      await repository.save(plan1);
      await repository.save(plan2);
      
      const loginPlans = await repository.findByStepDescription('login');
      expect(loginPlans).toHaveLength(1);
      expect(loginPlans[0].getId().equals(plan1.getId())).toBe(true);
      
      const searchPlans = await repository.findByStepDescription('search');
      expect(searchPlans).toHaveLength(1);
      expect(searchPlans[0].getId().equals(plan2.getId())).toBe(true);
    });

    it('should perform case-insensitive search', async () => {
      const plan = Plan.create(
        PlanId.generate(),
        WorkflowId.generate(),
        [new Step(StepId.generate(), PlanId.generate(), 'NAVIGATE to Login Page', Confidence.high(), 1)]
      ).getValue();
      
      await repository.save(plan);
      
      const results = await repository.findByStepDescription('navigate');
      expect(results).toHaveLength(1);
    });
  });

  describe('utility methods', () => {
    it('should clear all plans', async () => {
      await repository.save(samplePlan);
      expect(await repository.count()).toBe(1);
      
      await repository.clear();
      expect(await repository.count()).toBe(0);
    });

    it('should return all plan IDs', async () => {
      const plan1 = Plan.create(PlanId.generate(), WorkflowId.generate(), []).getValue();
      const plan2 = Plan.create(PlanId.generate(), WorkflowId.generate(), []).getValue();
      
      await repository.save(plan1);
      await repository.save(plan2);
      
      const ids = await repository.getAllIds();
      expect(ids).toHaveLength(2);
      expect(ids.some(id => id.equals(plan1.getId()))).toBe(true);
      expect(ids.some(id => id.equals(plan2.getId()))).toBe(true);
    });
  });
});