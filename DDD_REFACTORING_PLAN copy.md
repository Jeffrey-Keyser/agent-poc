# Domain-Driven Design Refactoring Plan for Agents Project

## Executive Summary

This document outlines a comprehensive refactoring plan to align the Agents codebase with Domain-Driven Design (DDD) principles. The refactoring will improve code organization, maintainability, and expressiveness by properly categorizing domain concepts into entities, value objects, aggregates, and domain services.

## Current State Analysis

### Problems Identified

1. **Misclassified Domain Objects**: Classes like `Variable` and `VariableString` are currently in the entities folder but should be value objects
2. **Missing Core Domain Concepts**: Key concepts like Task, Step, Workflow, and Plan are not explicitly modeled as domain objects
3. **Unclear Aggregate Boundaries**: No clear aggregate roots or bounded contexts defined
4. **Mixed Responsibilities**: Business logic scattered across services without clear separation between domain and application services
5. **Underutilized DDD Structure**: The `entities` and `value-objects` folders exist but are not being used effectively

### Existing Structure

```
src/core/
├── entities/          # Currently contains Variable (should be value object)
├── value-objects/     # Currently underutilized
├── agents/           # Agent implementations (mixed concerns)
├── services/         # Mixed domain and application services
├── interfaces/       # Type definitions
└── types/           # Additional type definitions
```

## Refactoring Plan

### Phase 1: Core Value Objects Creation
**Priority: High** | **Estimated Effort: 2-3 days**

#### 1.1 Migrate Existing Misclassified Objects

**Move from entities to value-objects:**
```typescript
// src/core/value-objects/variable.ts
export class Variable {
  constructor(
    public readonly name: string,
    public readonly value: string,
    public readonly isSecret: boolean
  ) {}
  
  equals(other: Variable): boolean {
    return this.name === other.name && 
           this.value === other.value && 
           this.isSecret === other.isSecret;
  }
}

// src/core/value-objects/variable-string.ts
export class VariableString {
  constructor(
    public readonly template: string,
    public readonly variables: ReadonlyArray<Variable>
  ) {}
  
  interpolate(): string {
    // Implementation
  }
}
```

#### 1.2 Create Identifier Value Objects

**Purpose**: Provide type-safe identifiers for entities

```typescript
// src/core/value-objects/identifiers/
├── task-id.ts
├── workflow-id.ts
├── plan-id.ts
├── step-id.ts
└── session-id.ts

// Example: src/core/value-objects/identifiers/task-id.ts
export class TaskId {
  constructor(private readonly value: string) {
    if (!value) throw new Error('TaskId cannot be empty');
  }
  
  toString(): string { return this.value; }
  equals(other: TaskId): boolean { return this.value === other.value; }
  static generate(): TaskId { return new TaskId(uuid()); }
}
```

#### 1.3 Create Domain-Specific Value Objects

**Web Automation Domain:**
```typescript
// src/core/value-objects/web/
├── url.ts              // Validated URL with protocol
├── element-selector.ts // CSS/XPath selector
├── viewport.ts         // Browser viewport dimensions
└── page-state.ts      // Immutable page state snapshot

// src/core/value-objects/url.ts
export class Url {
  private constructor(private readonly value: string) {}
  
  static create(value: string): Result<Url> {
    // Validation logic
    if (!isValidUrl(value)) {
      return Result.fail('Invalid URL format');
    }
    return Result.ok(new Url(value));
  }
  
  getHost(): string { /* ... */ }
  getPath(): string { /* ... */ }
  toString(): string { return this.value; }
}
```

**Execution Domain:**
```typescript
// src/core/value-objects/execution/
├── confidence.ts       // 0-100 confidence score
├── priority.ts        // Task priority level
├── duration.ts        // Time duration
├── retry-policy.ts   // Retry configuration
└── timeout.ts        // Timeout configuration

// src/core/value-objects/execution/confidence.ts
export class Confidence {
  private constructor(private readonly value: number) {}
  
  static create(value: number): Result<Confidence> {
    if (value < 0 || value > 100) {
      return Result.fail('Confidence must be between 0 and 100');
    }
    return Result.ok(new Confidence(value));
  }
  
  isHigh(): boolean { return this.value >= 80; }
  isMedium(): boolean { return this.value >= 50 && this.value < 80; }
  isLow(): boolean { return this.value < 50; }
}
```

**Task Domain:**
```typescript
// src/core/value-objects/task/
├── intent.ts          // Task intent (click, extract, navigate, etc.)
├── action-type.ts     // Specific action types
├── evidence.ts        // Evidence of task completion
└── extraction-schema.ts // Schema for data extraction

// src/core/value-objects/task/intent.ts
export class Intent {
  private static readonly VALID_INTENTS = [
    'click', 'extract', 'navigate', 'fill', 'select', 'wait'
  ] as const;
  
  private constructor(
    private readonly value: typeof Intent.VALID_INTENTS[number]
  ) {}
  
  static create(value: string): Result<Intent> {
    if (!Intent.VALID_INTENTS.includes(value as any)) {
      return Result.fail(`Invalid intent: ${value}`);
    }
    return Result.ok(new Intent(value as any));
  }
}
```

### Phase 2: Entity Modeling
**Priority: High** | **Estimated Effort: 3-4 days**

#### 2.1 Core Entity Definitions

**Workflow Entity (Aggregate Root):**
```typescript
// src/core/entities/workflow.ts
export class Workflow {
  private readonly id: WorkflowId;
  private status: WorkflowStatus;
  private readonly createdAt: Date;
  private updatedAt: Date;
  private plan?: Plan;
  private currentTask?: Task;
  private readonly executionHistory: ExecutionHistory;
  
  constructor(
    id: WorkflowId,
    public readonly goal: string,
    public readonly startUrl: Url,
    public readonly variables: ReadonlyArray<Variable>
  ) {
    this.id = id;
    this.status = WorkflowStatus.Pending;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.executionHistory = new ExecutionHistory();
  }
  
  // Domain methods
  start(): Result<void> {
    if (this.status !== WorkflowStatus.Pending) {
      return Result.fail('Workflow already started');
    }
    this.status = WorkflowStatus.Running;
    this.recordEvent(new WorkflowStartedEvent(this.id));
    return Result.ok();
  }
  
  attachPlan(plan: Plan): Result<void> {
    // Business logic for attaching plan
  }
  
  executeNextTask(): Result<Task> {
    // Business logic for task execution
  }
  
  complete(summary: string): Result<void> {
    // Business logic for completion
  }
  
  fail(reason: string): Result<void> {
    // Business logic for failure
  }
}
```

**Plan Entity:**
```typescript
// src/core/entities/plan.ts
export class Plan {
  private readonly id: PlanId;
  private readonly steps: Step[];
  private currentStepIndex: number = 0;
  
  constructor(
    id: PlanId,
    public readonly workflowId: WorkflowId,
    steps: Step[]
  ) {
    this.id = id;
    this.steps = steps;
  }
  
  getCurrentStep(): Step | undefined {
    return this.steps[this.currentStepIndex];
  }
  
  advance(): Result<void> {
    if (this.currentStepIndex >= this.steps.length - 1) {
      return Result.fail('No more steps in plan');
    }
    this.currentStepIndex++;
    return Result.ok();
  }
  
  isComplete(): boolean {
    return this.currentStepIndex >= this.steps.length;
  }
  
  addStep(step: Step): void {
    this.steps.push(step);
  }
  
  removeStep(stepId: StepId): Result<void> {
    // Business logic for removing step
  }
}
```

**Task Entity:**
```typescript
// src/core/entities/task.ts
export class Task {
  private readonly id: TaskId;
  private status: TaskStatus;
  private retryCount: number = 0;
  private readonly maxRetries: number;
  private result?: TaskResult;
  private error?: Error;
  
  constructor(
    id: TaskId,
    public readonly intent: Intent,
    public readonly description: string,
    public readonly priority: Priority,
    maxRetries: number = 3
  ) {
    this.id = id;
    this.status = TaskStatus.Pending;
    this.maxRetries = maxRetries;
  }
  
  execute(): void {
    if (this.status !== TaskStatus.Pending) {
      throw new Error('Task already executed');
    }
    this.status = TaskStatus.Running;
  }
  
  complete(result: TaskResult): Result<void> {
    if (this.status !== TaskStatus.Running) {
      return Result.fail('Task is not running');
    }
    this.status = TaskStatus.Completed;
    this.result = result;
    return Result.ok();
  }
  
  fail(error: Error): Result<void> {
    if (this.status !== TaskStatus.Running) {
      return Result.fail('Task is not running');
    }
    this.error = error;
    
    if (this.canRetry()) {
      this.status = TaskStatus.Pending;
      this.retryCount++;
      return Result.ok();
    }
    
    this.status = TaskStatus.Failed;
    return Result.ok();
  }
  
  canRetry(): boolean {
    return this.retryCount < this.maxRetries;
  }
}
```

**Step Entity:**
```typescript
// src/core/entities/step.ts
export class Step {
  private readonly id: StepId;
  private status: StepStatus;
  private readonly tasks: Task[] = [];
  
  constructor(
    id: StepId,
    public readonly description: string,
    public readonly order: number,
    public readonly confidence: Confidence
  ) {
    this.id = id;
    this.status = StepStatus.Pending;
  }
  
  addTask(task: Task): void {
    this.tasks.push(task);
  }
  
  getTasks(): ReadonlyArray<Task> {
    return this.tasks;
  }
  
  start(): Result<void> {
    if (this.status !== StepStatus.Pending) {
      return Result.fail('Step already started');
    }
    this.status = StepStatus.Running;
    return Result.ok();
  }
  
  complete(): Result<void> {
    const incompleteTasks = this.tasks.filter(t => !t.isComplete());
    if (incompleteTasks.length > 0) {
      return Result.fail('Step has incomplete tasks');
    }
    this.status = StepStatus.Completed;
    return Result.ok();
  }
}
```

**Session Entity:**
```typescript
// src/core/entities/session.ts
export class Session {
  private readonly id: SessionId;
  private status: SessionStatus;
  private readonly startedAt: Date;
  private endedAt?: Date;
  
  constructor(
    id: SessionId,
    public readonly workflowId: WorkflowId,
    public readonly browserConfig: BrowserConfig
  ) {
    this.id = id;
    this.status = SessionStatus.Active;
    this.startedAt = new Date();
  }
  
  end(): void {
    this.status = SessionStatus.Ended;
    this.endedAt = new Date();
  }
  
  getDuration(): Duration {
    const end = this.endedAt || new Date();
    return Duration.between(this.startedAt, end);
  }
}
```

### Phase 3: Aggregate Design
**Priority: Medium** | **Estimated Effort: 2-3 days**

#### 3.1 Workflow Aggregate

**Aggregate Root**: Workflow
**Entities**: Plan, Step, Task
**Value Objects**: All value objects from Phase 1

```typescript
// src/core/aggregates/workflow-aggregate.ts
export class WorkflowAggregate {
  constructor(
    private readonly workflow: Workflow,
    private readonly plan: Plan,
    private readonly session: Session
  ) {}
  
  // Coordinate operations across aggregate boundary
  executeNextStep(): Result<StepExecutionResult> {
    const currentStep = this.plan.getCurrentStep();
    if (!currentStep) {
      return Result.fail('No current step');
    }
    
    // Start transaction boundary
    currentStep.start();
    
    // Execute all tasks in step
    const tasks = currentStep.getTasks();
    for (const task of tasks) {
      task.execute();
      // Delegate to domain service for actual execution
    }
    
    return Result.ok(new StepExecutionResult(currentStep));
  }
  
  // Ensure aggregate invariants
  private validateInvariants(): void {
    // Business rules that must always be true
    if (this.workflow.isComplete() && !this.plan.isComplete()) {
      throw new Error('Workflow cannot be complete with incomplete plan');
    }
  }
}
```

#### 3.2 Execution Aggregate

**Aggregate Root**: ExecutionContext
**Entities**: CurrentExecution, ExecutionResult
**Value Objects**: PageState, ExtractedData

```typescript
// src/core/aggregates/execution-aggregate.ts
export class ExecutionAggregate {
  constructor(
    private readonly context: ExecutionContext,
    private readonly results: ExecutionResult[]
  ) {}
  
  recordExecution(task: Task, result: TaskResult): void {
    const execution = new ExecutionResult(
      task.getId(),
      result,
      new Date()
    );
    this.results.push(execution);
    this.context.updateLastExecution(execution);
  }
  
  getHistory(): ReadonlyArray<ExecutionResult> {
    return this.results;
  }
}
```

### Phase 4: Domain Services
**Priority: Medium** | **Estimated Effort: 3-4 days**

#### 4.1 Domain Service Definitions

**Planning Domain Service:**
```typescript
// src/core/domain-services/planning-service.ts
export interface PlanningService {
  createPlan(
    goal: string,
    context: PlanningContext
  ): Promise<Result<Plan>>;
  
  refinePlan(
    plan: Plan,
    feedback: EvaluationFeedback
  ): Promise<Result<Plan>>;
  
  decomposeStep(
    step: Step
  ): Promise<Result<Task[]>>;
}

export class AITaskPlanningService implements PlanningService {
  constructor(
    private readonly llm: LLMService,
    private readonly memoryService: MemoryService
  ) {}
  
  async createPlan(
    goal: string,
    context: PlanningContext
  ): Promise<Result<Plan>> {
    // Use LLM to generate strategic plan
    // Apply learned patterns from memory
    // Return domain Plan entity
  }
}
```

**Execution Domain Service:**
```typescript
// src/core/domain-services/execution-service.ts
export interface ExecutionService {
  executeTask(
    task: Task,
    context: ExecutionContext
  ): Promise<Result<TaskResult>>;
  
  executeStep(
    step: Step,
    context: ExecutionContext
  ): Promise<Result<StepResult>>;
}

export class BrowserExecutionService implements ExecutionService {
  constructor(
    private readonly browser: BrowserService,
    private readonly domService: DOMService
  ) {}
  
  async executeTask(
    task: Task,
    context: ExecutionContext
  ): Promise<Result<TaskResult>> {
    // Translate domain task to browser actions
    // Execute using browser/DOM services
    // Return domain result
  }
}
```

**Evaluation Domain Service:**
```typescript
// src/core/domain-services/evaluation-service.ts
export interface EvaluationService {
  evaluateTaskCompletion(
    task: Task,
    evidence: Evidence
  ): Promise<Result<EvaluationResult>>;
  
  evaluateStepSuccess(
    step: Step,
    results: TaskResult[]
  ): Promise<Result<StepEvaluation>>;
}

export class AIEvaluationService implements EvaluationService {
  constructor(
    private readonly llm: LLMService,
    private readonly screenshotService: ScreenshotService
  ) {}
  
  async evaluateTaskCompletion(
    task: Task,
    evidence: Evidence
  ): Promise<Result<EvaluationResult>> {
    // Use LLM with visual evidence
    // Return structured evaluation
  }
}
```

**Workflow Orchestration Service:**
```typescript
// src/core/domain-services/workflow-orchestration-service.ts
export class WorkflowOrchestrationService {
  constructor(
    private readonly planningService: PlanningService,
    private readonly executionService: ExecutionService,
    private readonly evaluationService: EvaluationService,
    private readonly errorHandler: ErrorHandlingService
  ) {}
  
  async orchestrate(workflow: Workflow): Promise<Result<WorkflowResult>> {
    // Coordinate between all domain services
    // Manage workflow lifecycle
    // Handle retries and error recovery
  }
}
```

### Phase 5: Repository Pattern
**Priority: Low** | **Estimated Effort: 2 days**

#### 5.1 Repository Interfaces

```typescript
// src/core/repositories/workflow-repository.ts
export interface WorkflowRepository {
  save(workflow: Workflow): Promise<void>;
  findById(id: WorkflowId): Promise<Workflow | undefined>;
  findByStatus(status: WorkflowStatus): Promise<Workflow[]>;
  update(workflow: Workflow): Promise<void>;
}

// src/core/repositories/plan-repository.ts
export interface PlanRepository {
  save(plan: Plan): Promise<void>;
  findById(id: PlanId): Promise<Plan | undefined>;
  findByWorkflowId(workflowId: WorkflowId): Promise<Plan[]>;
}

// src/core/repositories/memory-repository.ts
export interface MemoryRepository {
  savePattern(pattern: LearnedPattern): Promise<void>;
  findSimilarPatterns(context: string): Promise<LearnedPattern[]>;
  updatePatternSuccess(patternId: string, success: boolean): Promise<void>;
}
```

#### 5.2 In-Memory Implementations

```typescript
// src/infrastructure/repositories/in-memory-workflow-repository.ts
export class InMemoryWorkflowRepository implements WorkflowRepository {
  private workflows: Map<string, Workflow> = new Map();
  
  async save(workflow: Workflow): Promise<void> {
    this.workflows.set(workflow.getId().toString(), workflow);
  }
  
  async findById(id: WorkflowId): Promise<Workflow | undefined> {
    return this.workflows.get(id.toString());
  }
  
  // ... other methods
}
```

### Phase 6: Domain Events
**Priority: Low** | **Estimated Effort: 2 days**

#### 6.1 Event Definitions

```typescript
// src/core/domain-events/workflow-events.ts
export abstract class DomainEvent {
  constructor(
    public readonly aggregateId: string,
    public readonly occurredAt: Date = new Date()
  ) {}
}

export class WorkflowStartedEvent extends DomainEvent {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly goal: string
  ) {
    super(workflowId.toString());
  }
}

export class PlanCreatedEvent extends DomainEvent {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly planId: PlanId,
    public readonly stepCount: number
  ) {
    super(workflowId.toString());
  }
}

export class TaskCompletedEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly result: TaskResult
  ) {
    super(taskId.toString());
  }
}

export class WorkflowCompletedEvent extends DomainEvent {
  constructor(
    public readonly workflowId: WorkflowId,
    public readonly summary: string,
    public readonly extractedData: any
  ) {
    super(workflowId.toString());
  }
}
```

#### 6.2 Event Bus Implementation

```typescript
// src/core/domain-events/event-bus.ts
export interface EventHandler<T extends DomainEvent> {
  handle(event: T): Promise<void>;
}

export class EventBus {
  private handlers: Map<string, EventHandler<any>[]> = new Map();
  
  register<T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }
  
  async publish(event: DomainEvent): Promise<void> {
    const eventType = event.constructor.name;
    const handlers = this.handlers.get(eventType) || [];
    
    await Promise.all(
      handlers.map(handler => handler.handle(event))
    );
  }
}
```

## Migration Strategy

### Step 1: Create New Structure (No Breaking Changes)
1. Create all new value objects in `src/core/value-objects/`
2. Create all new entities in `src/core/entities/`
3. Create domain services in `src/core/domain-services/`
4. Keep existing code functional

### Step 2: Parallel Implementation
1. Implement new domain model alongside existing code
2. Create adapters to bridge old and new implementations
3. Add comprehensive tests for new domain model

### Step 3: Gradual Migration
1. Update agent implementations to use new domain model
2. Migrate one agent at a time (start with simpler ones)
3. Update services to use domain services
4. Maintain backward compatibility

### Step 4: Cleanup
1. Remove old Variable from entities folder
2. Remove deprecated services
3. Update all imports and references
4. Remove compatibility adapters

## Testing Strategy

### Unit Tests for Value Objects
```typescript
describe('TaskId', () => {
  it('should create valid TaskId', () => {
    const id = TaskId.generate();
    expect(id.toString()).toBeDefined();
  });
  
  it('should compare equality correctly', () => {
    const id1 = new TaskId('123');
    const id2 = new TaskId('123');
    const id3 = new TaskId('456');
    
    expect(id1.equals(id2)).toBe(true);
    expect(id1.equals(id3)).toBe(false);
  });
});
```

### Unit Tests for Entities
```typescript
describe('Workflow', () => {
  it('should transition states correctly', () => {
    const workflow = new Workflow(
      WorkflowId.generate(),
      'Test goal',
      Url.create('https://example.com').getValue(),
      []
    );
    
    expect(workflow.getStatus()).toBe(WorkflowStatus.Pending);
    
    const result = workflow.start();
    expect(result.isSuccess()).toBe(true);
    expect(workflow.getStatus()).toBe(WorkflowStatus.Running);
  });
});
```

### Integration Tests for Aggregates
```typescript
describe('WorkflowAggregate', () => {
  it('should execute workflow end-to-end', async () => {
    const aggregate = new WorkflowAggregate(
      workflow,
      plan,
      session
    );
    
    const result = await aggregate.executeNextStep();
    expect(result.isSuccess()).toBe(true);
  });
});
```

## Benefits of This Refactoring

### 1. **Improved Code Organization**
- Clear separation between entities and value objects
- Explicit aggregate boundaries
- Well-defined domain services

### 2. **Better Type Safety**
- Type-safe identifiers prevent mixing IDs
- Validated value objects ensure data integrity
- Compile-time checking of domain rules

### 3. **Enhanced Maintainability**
- Single responsibility for each class
- Clear domain boundaries
- Easier to understand and modify

### 4. **Improved Testability**
- Isolated domain logic
- Easy to mock dependencies
- Clear test boundaries

### 5. **Better Domain Expression**
- Code reads like the business domain
- Ubiquitous language throughout
- Self-documenting code

### 6. **Scalability**
- Easy to add new features
- Clear extension points
- Modular architecture

## Risk Mitigation

### Risks and Mitigations

1. **Risk**: Breaking existing functionality
   - **Mitigation**: Implement alongside existing code with gradual migration

2. **Risk**: Performance overhead from many small objects
   - **Mitigation**: Use object pooling and caching where appropriate

3. **Risk**: Increased complexity
   - **Mitigation**: Comprehensive documentation and examples

4. **Risk**: Team learning curve
   - **Mitigation**: Implement incrementally with knowledge sharing sessions

## Success Metrics

### Measurable Outcomes

1. **Code Quality Metrics**
   - Reduced cyclomatic complexity (target: <10 per method)
   - Increased test coverage (target: >80%)
   - Reduced coupling between modules

2. **Development Velocity**
   - Faster feature implementation
   - Reduced bug rate
   - Easier onboarding of new developers

3. **Runtime Metrics**
   - Maintained or improved performance
   - Better error handling and recovery
   - More predictable behavior

## Timeline

### Implementation Schedule

| Phase | Duration | Dependencies | Priority |
|-------|----------|--------------|----------|
| Phase 1: Value Objects | 2-3 days | None | High |
| Phase 2: Entities | 3-4 days | Phase 1 | High |
| Phase 3: Aggregates | 2-3 days | Phase 2 | Medium |
| Phase 4: Domain Services | 3-4 days | Phase 2 | Medium |
| Phase 5: Repositories | 2 days | Phase 2 | Low |
| Phase 6: Domain Events | 2 days | Phase 2 | Low |

**Total Estimated Time**: 14-18 days

## Next Steps

1. **Review and Approval**: Review this plan with the team
2. **Prioritization**: Confirm priority of phases
3. **Resource Allocation**: Assign developers to phases
4. **Implementation**: Begin with Phase 1 (Value Objects)
5. **Continuous Review**: Daily standup on progress
6. **Documentation**: Update as implementation proceeds

## Conclusion

This Domain-Driven Design refactoring will transform the Agents codebase into a more maintainable, testable, and expressive system. By properly modeling the domain with entities, value objects, aggregates, and domain services, we'll create a solid foundation for future development while maintaining the existing functionality.

The phased approach ensures we can deliver value incrementally while minimizing risk. Each phase builds upon the previous, creating a coherent domain model that accurately reflects the business requirements of web automation workflows.