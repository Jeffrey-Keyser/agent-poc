import { InMemoryWorkflowRepository } from '../in-memory-workflow-repository';
import { Workflow, WorkflowStatus } from '../../../core/entities';
import { WorkflowId, Variable, Url } from '../../../core/value-objects';

describe('InMemoryWorkflowRepository', () => {
  let repository: InMemoryWorkflowRepository;
  let sampleWorkflow: Workflow;
  let workflowId: WorkflowId;

  beforeEach(() => {
    repository = new InMemoryWorkflowRepository();
    workflowId = WorkflowId.generate();
    const url = Url.create('https://example.com').getValue();
    const variables: Variable[] = [
      Variable.create('testVar', 'testValue', false).getValue()
    ];
    sampleWorkflow = new Workflow(workflowId, 'Test workflow goal', url, variables);
  });

  afterEach(async () => {
    await repository.clear();
  });

  describe('save', () => {
    it('should save a workflow successfully', async () => {
      await expect(repository.save(sampleWorkflow)).resolves.not.toThrow();
      
      const retrieved = await repository.findById(workflowId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.getId().equals(workflowId)).toBe(true);
      expect(retrieved!.goal).toBe('Test workflow goal');
    });

    it('should throw error when saving workflow with existing ID', async () => {
      await repository.save(sampleWorkflow);
      
      await expect(repository.save(sampleWorkflow))
        .rejects.toThrow('Workflow with ID');
    });
  });

  describe('findById', () => {
    it('should return workflow when found', async () => {
      await repository.save(sampleWorkflow);
      
      const result = await repository.findById(workflowId);
      expect(result).toBeDefined();
      expect(result!.getId().equals(workflowId)).toBe(true);
    });

    it('should return undefined when workflow not found', async () => {
      const nonExistentId = WorkflowId.generate();
      
      const result = await repository.findById(nonExistentId);
      expect(result).toBeUndefined();
    });
  });

  describe('findByStatus', () => {
    it('should return workflows with specific status', async () => {
      const workflow1 = new Workflow(
        WorkflowId.generate(),
        'Goal 1',
        Url.create('https://example.com').getValue(),
        []
      );
      const workflow2 = new Workflow(
        WorkflowId.generate(),
        'Goal 2',
        Url.create('https://example.com').getValue(),
        []
      );
      
      await repository.save(workflow1);
      await repository.save(workflow2);
      
      // Start one workflow
      workflow1.start();
      await repository.update(workflow1);
      
      const pendingWorkflows = await repository.findByStatus(WorkflowStatus.PENDING);
      const runningWorkflows = await repository.findByStatus(WorkflowStatus.RUNNING);
      
      expect(pendingWorkflows).toHaveLength(1);
      expect(pendingWorkflows[0].getId().equals(workflow2.getId())).toBe(true);
      
      expect(runningWorkflows).toHaveLength(1);
      expect(runningWorkflows[0].getId().equals(workflow1.getId())).toBe(true);
    });

    it('should return empty array when no workflows match status', async () => {
      await repository.save(sampleWorkflow);
      
      const completedWorkflows = await repository.findByStatus(WorkflowStatus.COMPLETED);
      expect(completedWorkflows).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update existing workflow successfully', async () => {
      await repository.save(sampleWorkflow);
      
      sampleWorkflow.start();
      await expect(repository.update(sampleWorkflow)).resolves.not.toThrow();
      
      const retrieved = await repository.findById(workflowId);
      expect(retrieved!.getStatus()).toBe(WorkflowStatus.RUNNING);
    });

    it('should throw error when updating non-existent workflow', async () => {
      await expect(repository.update(sampleWorkflow))
        .rejects.toThrow('Workflow with ID');
    });
  });

  describe('delete', () => {
    it('should delete existing workflow successfully', async () => {
      await repository.save(sampleWorkflow);
      
      await expect(repository.delete(workflowId)).resolves.not.toThrow();
      
      const retrieved = await repository.findById(workflowId);
      expect(retrieved).toBeUndefined();
    });

    it('should throw error when deleting non-existent workflow', async () => {
      const nonExistentId = WorkflowId.generate();
      
      await expect(repository.delete(nonExistentId))
        .rejects.toThrow('Workflow with ID');
    });
  });

  describe('findAll', () => {
    it('should return all workflows when no pagination', async () => {
      const workflow1 = new Workflow(
        WorkflowId.generate(),
        'Goal 1',
        Url.create('https://example.com').getValue(),
        []
      );
      const workflow2 = new Workflow(
        WorkflowId.generate(),
        'Goal 2',
        Url.create('https://example.com').getValue(),
        []
      );
      
      await repository.save(workflow1);
      await repository.save(workflow2);
      
      const allWorkflows = await repository.findAll();
      expect(allWorkflows).toHaveLength(2);
    });

    it('should apply limit correctly', async () => {
      const workflow1 = new Workflow(
        WorkflowId.generate(),
        'Goal 1',
        Url.create('https://example.com').getValue(),
        []
      );
      const workflow2 = new Workflow(
        WorkflowId.generate(),
        'Goal 2',
        Url.create('https://example.com').getValue(),
        []
      );
      
      await repository.save(workflow1);
      await repository.save(workflow2);
      
      const limitedWorkflows = await repository.findAll(1);
      expect(limitedWorkflows).toHaveLength(1);
    });

    it('should apply offset and limit correctly', async () => {
      const workflow1 = new Workflow(
        WorkflowId.generate(),
        'Goal 1',
        Url.create('https://example.com').getValue(),
        []
      );
      const workflow2 = new Workflow(
        WorkflowId.generate(),
        'Goal 2',
        Url.create('https://example.com').getValue(),
        []
      );
      const workflow3 = new Workflow(
        WorkflowId.generate(),
        'Goal 3',
        Url.create('https://example.com').getValue(),
        []
      );
      
      await repository.save(workflow1);
      await repository.save(workflow2);
      await repository.save(workflow3);
      
      const paginatedWorkflows = await repository.findAll(1, 1);
      expect(paginatedWorkflows).toHaveLength(1);
    });
  });

  describe('count', () => {
    it('should return correct count', async () => {
      expect(await repository.count()).toBe(0);
      
      await repository.save(sampleWorkflow);
      expect(await repository.count()).toBe(1);
      
      const anotherWorkflow = new Workflow(
        WorkflowId.generate(),
        'Another goal',
        Url.create('https://example.com').getValue(),
        []
      );
      await repository.save(anotherWorkflow);
      expect(await repository.count()).toBe(2);
    });
  });

  describe('findByGoal', () => {
    it('should find workflows with matching goal text', async () => {
      const workflow1 = new Workflow(
        WorkflowId.generate(),
        'Search for products',
        Url.create('https://example.com').getValue(),
        []
      );
      const workflow2 = new Workflow(
        WorkflowId.generate(),
        'Buy some items',
        Url.create('https://example.com').getValue(),
        []
      );
      
      await repository.save(workflow1);
      await repository.save(workflow2);
      
      const searchResults = await repository.findByGoal('search');
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].goal).toContain('Search');
      
      const buyResults = await repository.findByGoal('buy');
      expect(buyResults).toHaveLength(1);
      expect(buyResults[0].goal).toContain('Buy');
    });

    it('should perform case-insensitive search', async () => {
      const workflow = new Workflow(
        WorkflowId.generate(),
        'SEARCH for Products',
        Url.create('https://example.com').getValue(),
        []
      );
      
      await repository.save(workflow);
      
      const results = await repository.findByGoal('search');
      expect(results).toHaveLength(1);
    });

    it('should return empty array when no matches', async () => {
      await repository.save(sampleWorkflow);
      
      const results = await repository.findByGoal('nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('utility methods', () => {
    it('should clear all workflows', async () => {
      await repository.save(sampleWorkflow);
      expect(await repository.count()).toBe(1);
      
      await repository.clear();
      expect(await repository.count()).toBe(0);
    });

    it('should return all workflow IDs', async () => {
      const workflow1 = new Workflow(
        WorkflowId.generate(),
        'Goal 1',
        Url.create('https://example.com').getValue(),
        []
      );
      const workflow2 = new Workflow(
        WorkflowId.generate(),
        'Goal 2',
        Url.create('https://example.com').getValue(),
        []
      );
      
      await repository.save(workflow1);
      await repository.save(workflow2);
      
      const ids = await repository.getAllIds();
      expect(ids).toHaveLength(2);
      expect(ids.some(id => id.equals(workflow1.getId()))).toBe(true);
      expect(ids.some(id => id.equals(workflow2.getId()))).toBe(true);
    });
  });
});