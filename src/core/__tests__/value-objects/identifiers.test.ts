import { WorkflowId, TaskId } from '../../value-objects/identifiers';

describe('Type-safe Identifiers', () => {
  describe('WorkflowId', () => {
    it('should generate unique IDs', () => {
      const id1 = WorkflowId.generate();
      const id2 = WorkflowId.generate();

      expect(id1.toString()).not.toBe(id2.toString());
      expect(id1.equals(id2)).toBe(false);
    });

    it('should create from string', () => {
      const testId = 'test-workflow-id-123';
      const id = WorkflowId.fromString(testId);

      expect(id.toString()).toBe(testId);
    });

    it('should throw error for empty string', () => {
      expect(() => WorkflowId.fromString('')).toThrow('WorkflowId cannot be empty');
      expect(() => WorkflowId.fromString('   ')).toThrow('WorkflowId cannot be empty');
    });

    it('should correctly compare equality', () => {
      const testId = 'same-id';
      const id1 = WorkflowId.fromString(testId);
      const id2 = WorkflowId.fromString(testId);
      const id3 = WorkflowId.fromString('different-id');

      expect(id1.equals(id2)).toBe(true);
      expect(id1.equals(id3)).toBe(false);
    });
  });

  describe('TaskId', () => {
    it('should generate unique IDs', () => {
      const id1 = TaskId.generate();
      const id2 = TaskId.generate();

      expect(id1.toString()).not.toBe(id2.toString());
      expect(id1.equals(id2)).toBe(false);
    });

    it('should create from string', () => {
      const testId = 'test-task-id-456';
      const id = TaskId.fromString(testId);

      expect(id.toString()).toBe(testId);
    });

    it('should throw error for empty string', () => {
      expect(() => TaskId.fromString('')).toThrow('TaskId cannot be empty');
      expect(() => TaskId.fromString('   ')).toThrow('TaskId cannot be empty');
    });

    it('should correctly compare equality', () => {
      const testId = 'same-task-id';
      const id1 = TaskId.fromString(testId);
      const id2 = TaskId.fromString(testId);
      const id3 = TaskId.fromString('different-task-id');

      expect(id1.equals(id2)).toBe(true);
      expect(id1.equals(id3)).toBe(false);
    });
  });

  describe('Mixed Identifier Types', () => {
    it('should not consider different ID types as equal even with same value', () => {
      const value = 'same-value-123';
      const workflowId = WorkflowId.fromString(value);
      const taskId = TaskId.fromString(value);

      // They should have same string representation
      expect(workflowId.toString()).toBe(taskId.toString());
      
      // But they are different types, so this test ensures type safety
      expect(workflowId.constructor.name).toBe('WorkflowId');
      expect(taskId.constructor.name).toBe('TaskId');
    });
  });
});