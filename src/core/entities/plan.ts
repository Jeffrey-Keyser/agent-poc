import { PlanId, WorkflowId, StepId } from '../value-objects';
import { Result } from './result';
import { Step } from './step';
import { DomainEvent, PlanCreatedEvent } from '../domain-events';

export class Plan {
  private readonly id: PlanId;
  private readonly steps: Step[];
  private currentStepIndex: number = 0;
  private readonly createdAt: Date;
  private updatedAt: Date;
  private readonly domainEvents: DomainEvent[] = [];

  constructor(
    id: PlanId,
    private readonly workflowId: WorkflowId,
    steps: Step[]
  ) {
    this.id = id;
    this.steps = [...steps]; // Create a copy to maintain encapsulation
    this.createdAt = new Date();
    this.updatedAt = new Date();
    
    // Validate steps are in correct order
    this.validateStepOrder();
    
    // Record plan creation event
    this.recordEvent(new PlanCreatedEvent(
      this.workflowId,
      this.id,
      steps.length
    ));
  }

  // Static factory method for creating plans
  static create(
    id: PlanId,
    workflowId: WorkflowId,
    steps: Step[]
  ): Result<Plan> {
    if (steps.length === 0) {
      return Result.fail('Plan must have at least one step');
    }

    // Validate step order
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].getOrder() !== i + 1) {
        return Result.fail(`Step ${i} has incorrect order. Expected ${i + 1}, got ${steps[i].getOrder()}`);
      }
    }

    return Result.ok(new Plan(id, workflowId, steps));
  }

  // Getters
  getId(): PlanId {
    return this.id;
  }

  getWorkflowId(): WorkflowId {
    return this.workflowId;
  }

  getSteps(): ReadonlyArray<Step> {
    return this.steps;
  }

  getCurrentStep(): Step | undefined {
    return this.steps[this.currentStepIndex];
  }

  getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  getTotalSteps(): number {
    return this.steps.length;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  getProgress(): number {
    const completedSteps = this.steps.filter(step => step.isComplete()).length;
    return this.steps.length > 0 ? completedSteps / this.steps.length : 0;
  }

  // Domain methods
  advance(): Result<void> {
    const currentStep = this.getCurrentStep();
    if (!currentStep) {
      return Result.fail('No current step');
    }

    if (!currentStep.isComplete()) {
      return Result.fail('Current step is not complete');
    }

    if (this.currentStepIndex >= this.steps.length - 1) {
      return Result.fail('No more steps in plan');
    }

    this.currentStepIndex++;
    this.updatedAt = new Date();
    
    return Result.ok();
  }

  goToStep(stepIndex: number): Result<void> {
    if (stepIndex < 0 || stepIndex >= this.steps.length) {
      return Result.fail('Invalid step index');
    }

    // Validate that all previous steps are completed
    for (let i = 0; i < stepIndex; i++) {
      if (!this.steps[i].isComplete()) {
        return Result.fail(`Cannot jump to step ${stepIndex + 1}: step ${i + 1} is not complete`);
      }
    }

    this.currentStepIndex = stepIndex;
    this.updatedAt = new Date();
    
    return Result.ok();
  }

  isComplete(): boolean {
    return this.steps.every(step => step.isComplete()) && 
           this.currentStepIndex >= this.steps.length - 1;
  }

  hasStarted(): boolean {
    return this.steps.some(step => step.hasStarted());
  }

  addStep(step: Step): Result<void> {
    // New step should have the next sequential order
    const expectedOrder = this.steps.length + 1;
    if (step.getOrder() !== expectedOrder) {
      return Result.fail(`Step order must be ${expectedOrder}, got ${step.getOrder()}`);
    }

    this.steps.push(step);
    this.updatedAt = new Date();
    
    return Result.ok();
  }

  insertStep(step: Step, atIndex: number): Result<void> {
    if (atIndex < 0 || atIndex > this.steps.length) {
      return Result.fail('Invalid insertion index');
    }

    if (atIndex <= this.currentStepIndex && this.hasStarted()) {
      return Result.fail('Cannot insert step before or at current step position after plan has started');
    }

    this.steps.splice(atIndex, 0, step);
    
    // Update order for all subsequent steps
    for (let i = atIndex; i < this.steps.length; i++) {
      this.steps[i].updateOrder(i + 1);
    }
    
    this.updatedAt = new Date();
    
    return Result.ok();
  }

  removeStep(stepId: StepId): Result<void> {
    const stepIndex = this.steps.findIndex(step => step.getId().equals(stepId));
    if (stepIndex === -1) {
      return Result.fail('Step not found in plan');
    }

    if (stepIndex <= this.currentStepIndex && this.hasStarted()) {
      return Result.fail('Cannot remove step that has been started or is currently active');
    }

    this.steps.splice(stepIndex, 1);
    
    // Update order for all subsequent steps
    for (let i = stepIndex; i < this.steps.length; i++) {
      this.steps[i].updateOrder(i + 1);
    }
    
    // Adjust current step index if necessary
    if (stepIndex < this.currentStepIndex) {
      this.currentStepIndex--;
    }
    
    this.updatedAt = new Date();
    
    return Result.ok();
  }

  getStepById(stepId: StepId): Step | undefined {
    return this.steps.find(step => step.getId().equals(stepId));
  }

  getStepByOrder(order: number): Step | undefined {
    return this.steps.find(step => step.getOrder() === order);
  }

  canAdvance(): boolean {
    const currentStep = this.getCurrentStep();
    return currentStep !== undefined && 
           currentStep.isComplete() && 
           this.currentStepIndex < this.steps.length - 1;
  }

  getRemainingSteps(): ReadonlyArray<Step> {
    return this.steps.slice(this.currentStepIndex + 1);
  }

  getCompletedSteps(): ReadonlyArray<Step> {
    return this.steps.filter(step => step.isComplete());
  }

  getPendingSteps(): ReadonlyArray<Step> {
    return this.steps.filter(step => step.getStatus() === 'pending');
  }

  // Validation methods
  private validateStepOrder(): void {
    for (let i = 0; i < this.steps.length; i++) {
      if (this.steps[i].getOrder() !== i + 1) {
        throw new Error(`Step at index ${i} has incorrect order. Expected ${i + 1}, got ${this.steps[i].getOrder()}`);
      }
    }
  }

  validateInvariants(): void {
    // Business rules that must always be true
    if (this.steps.length === 0) {
      throw new Error('Plan must have at least one step');
    }

    if (this.currentStepIndex < 0 || this.currentStepIndex >= this.steps.length) {
      throw new Error('Current step index is out of bounds');
    }

    this.validateStepOrder();

    // If marked as complete, all steps should be complete
    if (this.isComplete()) {
      const incompleteSteps = this.steps.filter(step => !step.isComplete());
      if (incompleteSteps.length > 0) {
        throw new Error('Plan marked as complete but has incomplete steps');
      }
    }
  }

  // Helper method to create a summary of the plan
  getSummary(): {
    totalSteps: number;
    completedSteps: number;
    currentStep: number;
    progress: number;
    isComplete: boolean;
  } {
    return {
      totalSteps: this.steps.length,
      completedSteps: this.getCompletedSteps().length,
      currentStep: this.currentStepIndex + 1,
      progress: this.getProgress(),
      isComplete: this.isComplete()
    };
  }

  // Domain events support
  getDomainEvents(): ReadonlyArray<DomainEvent> {
    return this.domainEvents;
  }

  private recordEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  clearDomainEvents(): void {
    this.domainEvents.splice(0, this.domainEvents.length);
  }
}