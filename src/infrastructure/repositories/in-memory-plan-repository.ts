import { Plan } from '../../core/entities';
import { PlanId, WorkflowId } from '../../core/value-objects/identifiers';
import { PlanRepository } from '../../core/repositories/plan-repository';

/**
 * In-memory implementation of PlanRepository.
 * Suitable for development, testing, and simple deployments.
 */
export class InMemoryPlanRepository implements PlanRepository {
  private plans: Map<string, Plan> = new Map();

  async save(plan: Plan): Promise<void> {
    const id = plan.getId().toString();
    if (this.plans.has(id)) {
      throw new Error(`Plan with ID ${id} already exists. Use update() instead.`);
    }
    this.plans.set(id, plan);
  }

  async findById(id: PlanId): Promise<Plan | undefined> {
    return this.plans.get(id.toString());
  }

  async findByWorkflowId(workflowId: WorkflowId): Promise<Plan[]> {
    const results: Plan[] = [];
    const targetWorkflowId = workflowId.toString();
    
    for (const plan of this.plans.values()) {
      if (plan.getWorkflowId().toString() === targetWorkflowId) {
        results.push(plan);
      }
    }
    
    // Sort by creation date (most recent first)
    return results.sort((a, b) => {
      const aTime = a.getCreatedAt?.() || new Date(0);
      const bTime = b.getCreatedAt?.() || new Date(0);
      return bTime.getTime() - aTime.getTime();
    });
  }

  async update(plan: Plan): Promise<void> {
    const id = plan.getId().toString();
    if (!this.plans.has(id)) {
      throw new Error(`Plan with ID ${id} not found. Use save() for new plans.`);
    }
    this.plans.set(id, plan);
  }

  async delete(id: PlanId): Promise<void> {
    const deleted = this.plans.delete(id.toString());
    if (!deleted) {
      throw new Error(`Plan with ID ${id.toString()} not found.`);
    }
  }

  async findLatestByWorkflowId(workflowId: WorkflowId): Promise<Plan | undefined> {
    const plans = await this.findByWorkflowId(workflowId);
    return plans.length > 0 ? plans[0] : undefined;
  }

  async findByStepCount(minSteps: number, maxSteps?: number): Promise<Plan[]> {
    const results: Plan[] = [];
    
    for (const plan of this.plans.values()) {
      const stepCount = plan.getSteps().length;
      if (stepCount >= minSteps && (maxSteps === undefined || stepCount <= maxSteps)) {
        results.push(plan);
      }
    }
    
    return results;
  }

  async count(): Promise<number> {
    return this.plans.size;
  }

  /**
   * Find plans by completion status.
   * @param isComplete Whether to find completed or incomplete plans
   * @returns Array of plans matching the completion status
   */
  async findByCompletionStatus(isComplete: boolean): Promise<Plan[]> {
    const results: Plan[] = [];
    
    for (const plan of this.plans.values()) {
      if (plan.isComplete() === isComplete) {
        results.push(plan);
      }
    }
    
    return results;
  }

  /**
   * Clear all plans from the repository.
   * Useful for testing and development.
   */
  async clear(): Promise<void> {
    this.plans.clear();
  }

  /**
   * Get all plan IDs currently in the repository.
   * Useful for debugging and administrative tasks.
   */
  async getAllIds(): Promise<PlanId[]> {
    const ids: PlanId[] = [];
    for (const plan of this.plans.values()) {
      ids.push(plan.getId());
    }
    return ids;
  }

  /**
   * Find plans that contain steps with specific descriptions.
   * @param description The step description to search for
   * @returns Array of plans containing matching steps
   */
  async findByStepDescription(description: string): Promise<Plan[]> {
    const results: Plan[] = [];
    const searchTerm = description.toLowerCase();
    
    for (const plan of this.plans.values()) {
      const steps = plan.getSteps();
      const hasMatchingStep = steps.some(step => 
        step.getDescription().toLowerCase().includes(searchTerm)
      );
      
      if (hasMatchingStep) {
        results.push(plan);
      }
    }
    
    return results;
  }
}