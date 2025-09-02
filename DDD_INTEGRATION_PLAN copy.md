# Domain-Driven Design Integration Plan for Agents Project

## Executive Summary

This document outlines a comprehensive plan to integrate the recently completed Domain-Driven Design (DDD) models with the existing multi-agent infrastructure. The integration will be performed in phases to minimize disruption while maximizing the benefits of the rich domain models.

## Current State Analysis

### Existing Architecture Overview

The agents codebase currently implements a **multi-agent system** with the following characteristics:

#### Core Components
1. **Multi-Agent System**
   - TaskPlannerAgent: Strategic plan creation (3-7 high-level steps)
   - TaskExecutorAgent: Micro-action execution with DOM interaction
   - TaskEvaluatorAgent: Step completion validation
   - TaskSummarizerAgent: Structured output generation
   - ErrorHandlerAgent: Failure analysis and recovery

2. **Service Layer**
   - WorkflowManager: Main orchestration service
   - StateManager: Page state and data extraction management
   - MemoryService: Learning pattern storage
   - VariableManager: Simple string interpolation

3. **Infrastructure**
   - EventBus: Event-driven communication
   - AgentFactory: Agent instantiation
   - Partial DDD implementation (WorkflowAggregate)

### Current Execution Flow

```
1. Entry Point: agent-amazon-multi.ts → initMultiAgent()
2. Agent Creation: AgentFactory.createAllAgents()
3. Workflow Start: WorkflowManager.executeWorkflow()
4. Planning Phase: TaskPlannerAgent.createPlan()
5. Execution Loop:
   ├── TaskExecutorAgent.decompose() → micro-actions
   ├── TaskExecutorAgent.execute() → DOM interactions
   ├── TaskEvaluatorAgent.evaluate() → validation
   └── MemoryService.record() → learning
6. Summary: TaskSummarizerAgent.summarize()
```

### Identified Integration Points

| Component | Current Implementation | DDD Integration Point |
|-----------|----------------------|----------------------|
| Variable Management | Simple VariableManager service | Rich Variable/VariableString value objects |
| Workflow State | Direct state manipulation | Workflow entity with proper lifecycle |
| Task Execution | Procedural execution logic | Task entity with retry policies |
| Planning | Array of step objects | Plan entity with Step entities |
| Memory/Learning | Simple pattern storage | MemoryRepository with LearnedPattern |
| Events | Basic EventBus | Full domain event system |
| Data Access | Direct service access | Repository pattern |

### Problems to Address

1. **Dual Variable Implementations**: Both service-level and entity-level implementations exist
2. **Scattered Domain Logic**: Business rules spread across services and agents
3. **Missing Abstractions**: No repository layer for data access
4. **Underutilized DDD Models**: Rich domain models not integrated into execution flow
5. **Weak Type Safety**: Missing type-safe identifiers (WorkflowId, TaskId, etc.)
6. **Limited Event Usage**: Domain events not fully leveraged for state changes

## Integration Strategy

### Design Principles

1. **Incremental Migration**: Phase-based approach to minimize disruption
2. **Backward Compatibility**: Maintain existing interfaces during transition
3. **Test-Driven**: Comprehensive testing at each phase
4. **Domain-Centric**: Move business logic into domain models
5. **Event-Driven**: Leverage domain events for coordination

### Phase 1: Value Object Migration
**Duration**: 2-3 days | **Risk**: Low | **Priority**: High

#### Objectives
- Replace simple Variable/VariableString with DDD value objects
- Introduce type-safe identifiers throughout the system
- Establish foundation for further DDD integration

#### Tasks

1. **Variable/VariableString Migration**
   ```typescript
   // Before (TaskExecutor line 262-263)
   const variables = this.config.variables || [];
   const variableString = new VariableString(userInput, variables);
   
   // After
   const variables = this.config.variables.map(v => 
     Variable.create(v.name, v.value, v.isSecret)
   );
   const variableString = VariableString.create(userInput, variables);
   ```

2. **Identifier Introduction**
   ```typescript
   // Before
   const workflowId = uuid();
   
   // After
   const workflowId = WorkflowId.generate();
   ```

3. **Update Import Paths**
   - Change: `src/core/entities/variable.ts` → `src/core/value-objects/variable.ts`
   - Change: `src/core/entities/variable-string.ts` → `src/core/value-objects/variable-string.ts`

4. **Service Layer Updates**
   - Modify VariableManager to use domain value objects internally
   - Update StateManager to use PageState value object
   - Introduce Url value object for URL handling

#### Files to Modify
- `src/core/agents/TaskExecutor.ts`
- `src/core/services/VariableManager.ts`
- `src/core/services/StateManager.ts`
- `src/core/services/WorkflowManager.ts`

### Phase 2: Entity Integration
**Duration**: 3-4 days | **Risk**: Medium | **Priority**: High

#### Objectives
- Replace procedural workflow logic with Workflow entity
- Introduce Plan and Step entities for execution structure
- Implement Task entity with retry logic

#### Tasks

1. **Workflow Entity Integration**
   ```typescript
   // Before (WorkflowManager)
   const workflow = {
     id: uuid(),
     goal: userGoal,
     status: 'pending'
   };
   
   // After
   const workflow = Workflow.create(
     WorkflowId.generate(),
     userGoal,
     Url.create(startUrl),
     variables
   );
   ```

2. **Plan/Step Entity Usage**
   ```typescript
   // Before (TaskPlannerAgent)
   const strategicSteps = await this.generateStrategicPlan(goal);
   
   // After
   const plan = await this.createPlan(goal, context);
   workflow.attachPlan(plan);
   ```

3. **Task Entity with Retry**
   ```typescript
   // Before
   const task = { action, retries: 0 };
   
   // After
   const task = Task.create(
     TaskId.generate(),
     Intent.create(action.type),
     action.description,
     Priority.medium(),
     retryPolicy
   );
   ```

#### Files to Modify
- `src/core/services/WorkflowManager.ts`
- `src/core/agents/TaskPlannerAgent.ts`
- `src/core/agents/TaskExecutorAgent.ts`
- `src/core/agents/TaskEvaluatorAgent.ts`

### Phase 3: Aggregate Implementation
**Duration**: 2-3 days | **Risk**: Medium | **Priority**: Medium

#### Objectives
- Introduce WorkflowAggregate for complex operations
- Implement ExecutionAggregate for execution context
- Ensure transaction boundaries and invariants

#### Tasks

1. **WorkflowAggregate Usage**
   ```typescript
   // Coordinate workflow execution through aggregate
   const aggregate = WorkflowAggregate.create(workflow, plan, session);
   const result = await aggregate.executeNextStep();
   ```

2. **ExecutionAggregate for Context**
   ```typescript
   const executionAggregate = new ExecutionAggregate(context);
   await executionAggregate.recordExecution(task, result, evidence);
   ```

3. **Invariant Enforcement**
   - Validate workflow state transitions
   - Ensure plan consistency
   - Maintain session health

#### Files to Modify
- `src/core/services/WorkflowManager.ts`
- `src/core/agents/TaskExecutorAgent.ts`
- Create: `src/core/services/WorkflowOrchestrator.ts`

### Phase 4: Domain Service Integration
**Duration**: 3-4 days | **Risk**: Low | **Priority**: Medium

#### Objectives
- Extract business logic into domain services
- Implement proper service boundaries
- Separate domain from application services

#### Tasks

1. **Planning Domain Service**
   ```typescript
   // Integrate AI planning with domain models
   class AITaskPlanningService implements PlanningService {
     async createPlan(goal: string, context: PlanningContext): Promise<Result<Plan>> {
       // Use LLM to generate plan
       // Return domain Plan entity
     }
   }
   ```

2. **Execution Domain Service**
   ```typescript
   // Bridge between domain tasks and browser automation
   class BrowserExecutionService implements ExecutionService {
     async executeTask(task: Task, context: ExecutionContext): Promise<Result<TaskResult>> {
       // Translate domain task to browser actions
       // Execute and return domain result
     }
   }
   ```

3. **Evaluation Domain Service**
   ```typescript
   // AI-powered task completion evaluation
   class AIEvaluationService implements EvaluationService {
     async evaluateTaskCompletion(task: Task, evidence: Evidence): Promise<Result<EvaluationResult>> {
       // Use vision AI to evaluate
       // Return structured evaluation
     }
   }
   ```

#### Files to Create
- `src/infrastructure/services/AITaskPlanningService.ts`
- `src/infrastructure/services/BrowserExecutionService.ts`
- `src/infrastructure/services/AIEvaluationService.ts`

#### Files to Modify
- `src/core/agents/TaskPlannerAgent.ts` (use PlanningService)
- `src/core/agents/TaskExecutorAgent.ts` (use ExecutionService)
- `src/core/agents/TaskEvaluatorAgent.ts` (use EvaluationService)

### Phase 5: Repository Pattern Implementation
**Duration**: 2 days | **Risk**: Low | **Priority**: Low

#### Objectives
- Implement repository pattern for data access
- Abstract storage concerns from domain
- Enable different storage strategies

#### Tasks

1. **WorkflowRepository Integration**
   ```typescript
   // Before
   this.workflows.set(workflow.id, workflow);
   
   // After
   await this.workflowRepository.save(workflow);
   ```

2. **MemoryRepository for Learning**
   ```typescript
   // Store and retrieve learned patterns
   const patterns = await this.memoryRepository.findSimilarPatterns(context);
   await this.memoryRepository.savePattern(newPattern);
   ```

3. **PlanRepository for Plan Storage**
   ```typescript
   const latestPlan = await this.planRepository.findLatestByWorkflowId(workflowId);
   ```

#### Files to Create
- `src/infrastructure/repositories/InMemoryWorkflowRepository.ts`
- `src/infrastructure/repositories/InMemoryPlanRepository.ts`
- `src/infrastructure/repositories/InMemoryMemoryRepository.ts`

#### Files to Modify
- `src/core/services/WorkflowManager.ts`
- `src/core/services/MemoryService.ts`

### Phase 6: Domain Events Integration
**Duration**: 2 days | **Risk**: Low | **Priority**: Low

#### Objectives
- Integrate domain events with existing EventBus
- Enable event-driven coordination
- Implement event handlers for key workflows

#### Tasks

1. **Domain Event Publishing**
   ```typescript
   // Workflow events
   workflow.start(); // Publishes WorkflowStartedEvent
   workflow.complete(summary); // Publishes WorkflowCompletedEvent
   
   // Task events
   task.execute(); // Publishes TaskStartedEvent
   task.complete(result); // Publishes TaskCompletedEvent
   ```

2. **Event Handler Integration**
   ```typescript
   // Connect domain events to existing EventBus
   eventBus.register('WorkflowCompletedEvent', new WorkflowCompletionHandler());
   eventBus.register('TaskFailedEvent', new TaskFailureHandler());
   ```

3. **Metrics and Monitoring**
   ```typescript
   // Use MetricsEventHandler for analytics
   eventBus.register('*', new MetricsEventHandler());
   ```

#### Files to Modify
- `src/core/services/EventBus.ts`
- `src/core/services/WorkflowManager.ts`
- Create: `src/infrastructure/event-handlers/`

## Migration Approach

### Step-by-Step Migration Process

1. **Create Adapter Layer**
   - Build adapters to bridge old and new implementations
   - Maintain backward compatibility during transition

2. **Parallel Implementation**
   - Run new DDD models alongside existing code
   - Use feature flags to switch between implementations

3. **Incremental Rollout**
   - Migrate one agent at a time
   - Start with TaskExecutorAgent (simplest integration)
   - Progress to more complex agents

4. **Testing Strategy**
   - Write tests for new domain models
   - Ensure existing tests continue to pass
   - Add integration tests for DDD components

5. **Cleanup Phase**
   - Remove old implementations once migration complete
   - Delete adapter layer
   - Update documentation

### Risk Mitigation

| Risk | Mitigation Strategy |
|------|-------------------|
| Breaking existing functionality | Implement alongside with feature flags |
| Performance degradation | Profile and optimize critical paths |
| Complex migration | Break into smaller, atomic changes |
| Team knowledge gaps | Document patterns and provide examples |

## Implementation Checklist

### Phase 1: Value Objects ☐
- [ ] Migrate Variable to value object
- [ ] Migrate VariableString to value object
- [ ] Introduce type-safe identifiers
- [ ] Update TaskExecutor imports
- [ ] Update VariableManager service
- [ ] Add value object tests

### Phase 2: Entities ☐
- [ ] Integrate Workflow entity
- [ ] Implement Plan/Step entities
- [ ] Add Task entity with retry
- [ ] Update WorkflowManager
- [ ] Modify agent implementations
- [ ] Add entity tests

### Phase 3: Aggregates ☐
- [ ] Implement WorkflowAggregate usage
- [ ] Add ExecutionAggregate
- [ ] Enforce invariants
- [ ] Update orchestration logic
- [ ] Add aggregate tests

### Phase 4: Domain Services ☐
- [ ] Create AITaskPlanningService
- [ ] Create BrowserExecutionService
- [ ] Create AIEvaluationService
- [ ] Update agents to use services
- [ ] Add service tests

### Phase 5: Repositories ☐
- [ ] Implement WorkflowRepository
- [ ] Implement MemoryRepository
- [ ] Implement PlanRepository
- [ ] Update services to use repositories
- [ ] Add repository tests

### Phase 6: Domain Events ☐
- [ ] Integrate domain events with EventBus
- [ ] Create event handlers
- [ ] Add metrics collection
- [ ] Implement event logging
- [ ] Add event tests

## Success Metrics

### Technical Metrics
- **Code Coverage**: Maintain >80% test coverage
- **Performance**: No degradation in execution time
- **Type Safety**: Zero runtime type errors
- **Memory Usage**: <10% increase in memory footprint

### Business Metrics
- **Reliability**: Reduced failure rate through retry logic
- **Maintainability**: Decreased time to implement new features
- **Debuggability**: Improved error messages and event logging
- **Scalability**: Easier to add new agent types

### Quality Metrics
- **Cyclomatic Complexity**: <10 per method
- **Code Duplication**: <5% duplicate code
- **Technical Debt**: Reduced by 40%
- **Documentation**: 100% public API documented

## Timeline

| Phase | Duration | Start Date | End Date | Dependencies |
|-------|----------|------------|----------|--------------|
| Phase 1: Value Objects | 2-3 days | TBD | TBD | None |
| Phase 2: Entities | 3-4 days | TBD | TBD | Phase 1 |
| Phase 3: Aggregates | 2-3 days | TBD | TBD | Phase 2 |
| Phase 4: Domain Services | 3-4 days | TBD | TBD | Phase 2 |
| Phase 5: Repositories | 2 days | TBD | TBD | Phase 2 |
| Phase 6: Domain Events | 2 days | TBD | TBD | Phase 2 |

**Total Estimated Duration**: 14-18 days

## Code Examples

### Example 1: Variable Migration

**Before:**
```typescript
// src/core/agents/TaskExecutor.ts
const variables = this.config.variables || [];
const variableString = new VariableString(userInput, variables);
const interpolated = variableString.interpolate();
```

**After:**
```typescript
// src/core/agents/TaskExecutor.ts
import { Variable, VariableString } from '../value-objects';

const variables = this.config.variables.map(v => 
  Variable.create(v.name, v.value, v.isSecret).getValue()
);
const variableString = VariableString.create(userInput, variables).getValue();
const interpolated = variableString.interpolate();
```

### Example 2: Workflow Entity Usage

**Before:**
```typescript
// src/core/services/WorkflowManager.ts
async executeWorkflow(goal: string, url: string) {
  const workflow = {
    id: uuid(),
    goal,
    url,
    status: 'pending',
    createdAt: new Date()
  };
  
  workflow.status = 'running';
  // ... execution logic
  workflow.status = 'completed';
}
```

**After:**
```typescript
// src/core/services/WorkflowManager.ts
import { Workflow, WorkflowId, Url } from '../entities';
import { WorkflowAggregate } from '../aggregates';

async executeWorkflow(goal: string, url: string) {
  const workflow = Workflow.create(
    WorkflowId.generate(),
    goal,
    Url.create(url).getValue(),
    []
  ).getValue();
  
  const aggregate = WorkflowAggregate.create(
    workflow,
    plan,
    session
  ).getValue();
  
  await aggregate.startExecution();
  // ... execution logic
  await aggregate.completeWorkflow(summary);
}
```

### Example 3: Domain Service Integration

**Before:**
```typescript
// src/core/agents/TaskPlannerAgent.ts
async createPlan(goal: string): Promise<any[]> {
  const prompt = this.buildPlanningPrompt(goal);
  const response = await this.llm.complete(prompt);
  return this.parsePlan(response);
}
```

**After:**
```typescript
// src/core/agents/TaskPlannerAgent.ts
import { PlanningService } from '../domain-services';

constructor(
  private planningService: PlanningService
) {}

async createPlan(goal: string, context: PlanningContext): Promise<Plan> {
  const result = await this.planningService.createPlan(goal, context);
  if (result.isFailure()) {
    throw new Error(result.getError());
  }
  return result.getValue();
}
```

### Example 4: Repository Pattern

**Before:**
```typescript
// src/core/services/MemoryService.ts
private patterns: Map<string, any> = new Map();

savePattern(pattern: any) {
  this.patterns.set(pattern.id, pattern);
}

findSimilarPatterns(context: string): any[] {
  // Manual filtering logic
}
```

**After:**
```typescript
// src/core/services/MemoryService.ts
import { MemoryRepository } from '../repositories';

constructor(
  private memoryRepository: MemoryRepository
) {}

async savePattern(pattern: LearnedPattern): Promise<void> {
  await this.memoryRepository.savePattern(pattern);
}

async findSimilarPatterns(context: string): Promise<LearnedPattern[]> {
  return this.memoryRepository.findSimilarPatterns(context, 10);
}
```

### Example 5: Domain Events

**Before:**
```typescript
// src/core/services/WorkflowManager.ts
this.eventBus.emit('workflow-started', { workflowId, goal });
```

**After:**
```typescript
// src/core/services/WorkflowManager.ts
import { WorkflowStartedEvent } from '../domain-events';

const event = new WorkflowStartedEvent(workflow.getId(), workflow.goal);
await this.eventBus.publish(event);
```

## Recommendations

### Immediate Actions (Week 1)
1. Set up feature flags for gradual rollout
2. Create adapter layer for Variable/VariableString
3. Begin Phase 1 value object migration
4. Write comprehensive tests for new value objects

### Short-term Goals (Weeks 2-3)
1. Complete Phase 1 and Phase 2 implementations
2. Migrate at least one agent to use new models
3. Establish monitoring for performance impact
4. Document new patterns for team

### Long-term Vision (Month 2+)
1. Complete all six phases
2. Remove legacy implementations
3. Optimize performance based on metrics
4. Consider adding CQRS pattern
5. Evaluate event sourcing benefits

## Conclusion

This integration plan provides a systematic approach to incorporating the rich DDD models into the existing multi-agent architecture. By following this phased approach, we can:

1. **Minimize Risk**: Gradual migration with backward compatibility
2. **Maximize Value**: Leverage DDD benefits incrementally
3. **Maintain Quality**: Comprehensive testing at each phase
4. **Improve Architecture**: Clean separation of concerns
5. **Enable Scale**: Foundation for future enhancements

The key to success is maintaining discipline in following the phases while being flexible enough to adapt based on learnings during implementation. Each phase builds upon the previous, creating a robust, maintainable, and scalable system that properly leverages Domain-Driven Design principles.