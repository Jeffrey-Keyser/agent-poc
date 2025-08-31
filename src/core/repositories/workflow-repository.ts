import { Workflow, WorkflowStatus } from '../entities';
import { WorkflowId } from '../value-objects/identifiers';

/**
 * Repository interface for Workflow aggregate persistence.
 * Follows DDD repository pattern for aggregate persistence.
 */
export interface WorkflowRepository {
  /**
   * Save a new workflow to the repository.
   * @param workflow The workflow to save
   */
  save(workflow: Workflow): Promise<void>;

  /**
   * Find a workflow by its unique identifier.
   * @param id The workflow ID
   * @returns The workflow if found, undefined otherwise
   */
  findById(id: WorkflowId): Promise<Workflow | undefined>;

  /**
   * Find workflows by their current status.
   * @param status The workflow status to filter by
   * @returns Array of workflows with the specified status
   */
  findByStatus(status: WorkflowStatus): Promise<Workflow[]>;

  /**
   * Update an existing workflow in the repository.
   * @param workflow The workflow to update
   */
  update(workflow: Workflow): Promise<void>;

  /**
   * Delete a workflow from the repository.
   * @param id The workflow ID to delete
   */
  delete(id: WorkflowId): Promise<void>;

  /**
   * Find all workflows (with optional pagination).
   * @param limit Optional limit for the number of results
   * @param offset Optional offset for pagination
   * @returns Array of workflows
   */
  findAll(limit?: number, offset?: number): Promise<Workflow[]>;

  /**
   * Count total number of workflows.
   * @returns Total count of workflows
   */
  count(): Promise<number>;

  /**
   * Find workflows by goal text (fuzzy search).
   * @param goal The goal text to search for
   * @returns Array of matching workflows
   */
  findByGoal(goal: string): Promise<Workflow[]>;
}