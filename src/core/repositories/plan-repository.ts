import { Plan } from '../entities';
import { PlanId, WorkflowId } from '../value-objects/identifiers';

/**
 * Repository interface for Plan entity persistence.
 * Plans are associated with workflows and contain execution steps.
 */
export interface PlanRepository {
  /**
   * Save a new plan to the repository.
   * @param plan The plan to save
   */
  save(plan: Plan): Promise<void>;

  /**
   * Find a plan by its unique identifier.
   * @param id The plan ID
   * @returns The plan if found, undefined otherwise
   */
  findById(id: PlanId): Promise<Plan | undefined>;

  /**
   * Find all plans associated with a specific workflow.
   * @param workflowId The workflow ID to filter by
   * @returns Array of plans for the workflow
   */
  findByWorkflowId(workflowId: WorkflowId): Promise<Plan[]>;

  /**
   * Update an existing plan in the repository.
   * @param plan The plan to update
   */
  update(plan: Plan): Promise<void>;

  /**
   * Delete a plan from the repository.
   * @param id The plan ID to delete
   */
  delete(id: PlanId): Promise<void>;

  /**
   * Find the most recent plan for a workflow.
   * @param workflowId The workflow ID
   * @returns The most recent plan if found, undefined otherwise
   */
  findLatestByWorkflowId(workflowId: WorkflowId): Promise<Plan | undefined>;

  /**
   * Find plans by step count range.
   * @param minSteps Minimum number of steps
   * @param maxSteps Maximum number of steps
   * @returns Array of plans within the step count range
   */
  findByStepCount(minSteps: number, maxSteps?: number): Promise<Plan[]>;

  /**
   * Count total number of plans.
   * @returns Total count of plans
   */
  count(): Promise<number>;
}