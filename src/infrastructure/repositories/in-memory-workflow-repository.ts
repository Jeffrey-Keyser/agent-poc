import { Workflow, WorkflowStatus } from '../../core/entities';
import { WorkflowId } from '../../core/value-objects/identifiers';
import { WorkflowRepository } from '../../core/repositories/workflow-repository';

/**
 * In-memory implementation of WorkflowRepository.
 * Suitable for development, testing, and simple deployments.
 */
export class InMemoryWorkflowRepository implements WorkflowRepository {
  private workflows: Map<string, Workflow> = new Map();

  async save(workflow: Workflow): Promise<void> {
    const id = workflow.getId().toString();
    if (this.workflows.has(id)) {
      throw new Error(`Workflow with ID ${id} already exists. Use update() instead.`);
    }
    this.workflows.set(id, workflow);
  }

  async findById(id: WorkflowId): Promise<Workflow | undefined> {
    return this.workflows.get(id.toString());
  }

  async findByStatus(status: WorkflowStatus): Promise<Workflow[]> {
    const results: Workflow[] = [];
    for (const workflow of this.workflows.values()) {
      if (workflow.getStatus() === status) {
        results.push(workflow);
      }
    }
    return results;
  }

  async update(workflow: Workflow): Promise<void> {
    const id = workflow.getId().toString();
    if (!this.workflows.has(id)) {
      throw new Error(`Workflow with ID ${id} not found. Use save() for new workflows.`);
    }
    this.workflows.set(id, workflow);
  }

  async delete(id: WorkflowId): Promise<void> {
    const deleted = this.workflows.delete(id.toString());
    if (!deleted) {
      throw new Error(`Workflow with ID ${id.toString()} not found.`);
    }
  }

  async findAll(limit?: number, offset?: number): Promise<Workflow[]> {
    const allWorkflows = Array.from(this.workflows.values());
    
    if (offset !== undefined) {
      const startIndex = Math.max(0, offset);
      const endIndex = limit !== undefined ? startIndex + limit : undefined;
      return allWorkflows.slice(startIndex, endIndex);
    }
    
    if (limit !== undefined) {
      return allWorkflows.slice(0, limit);
    }
    
    return allWorkflows;
  }

  async count(): Promise<number> {
    return this.workflows.size;
  }

  async findByGoal(goal: string): Promise<Workflow[]> {
    const results: Workflow[] = [];
    const searchTerm = goal.toLowerCase();
    
    for (const workflow of this.workflows.values()) {
      if (workflow.goal.toLowerCase().includes(searchTerm)) {
        results.push(workflow);
      }
    }
    
    return results;
  }

  /**
   * Clear all workflows from the repository.
   * Useful for testing and development.
   */
  async clear(): Promise<void> {
    this.workflows.clear();
  }

  /**
   * Get all workflow IDs currently in the repository.
   * Useful for debugging and administrative tasks.
   */
  async getAllIds(): Promise<WorkflowId[]> {
    const ids: WorkflowId[] = [];
    for (const workflow of this.workflows.values()) {
      ids.push(workflow.getId());
    }
    return ids;
  }
}