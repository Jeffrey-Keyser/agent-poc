# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a sophisticated web automation framework featuring dual architectures:
- **Legacy System**: Monolithic agent with comprehensive 276-line prompt (stable, battle-tested)
- **Multi-Agent System**: Modern DDD-based architecture with specialized agents for intelligent browser automation

The codebase follows Domain-Driven Design (DDD) principles with clear separation of concerns, event-driven architecture, and workflow orchestration capabilities.

## Common Commands

### Build and Development
```bash
npm run build              # Compile TypeScript to JavaScript
npm run dev               # Run in development mode with watch
npm run clean             # Clean build artifacts
```

### Running Agents
```bash
# Multi-agent system (recommended)
npm run start:amazon-multi    # Amazon automation with multi-agent
npm run start:github          # GitHub automation (placeholder)

# Legacy system
npm start                     # Run default agent-poc.ts
npm run start:amazon         # Amazon automation (legacy)
npm run start:grubhub        # GrubHub automation
npm run start:openator       # Openator automation
```

### Testing
```bash
npm test                      # Run test suite (currently placeholder)
# Tests use Jest framework, located in __tests__ directories
# Test patterns: *.test.ts, *.spec.ts
```

### Browser Setup
```bash
npm run install:browsers      # Install Playwright browsers
npx playwright install chromium  # Install Chromium specifically
```

## Architecture

### Domain-Driven Design Structure

The codebase implements DDD with the following key components:

#### Core Domain (`src/core/`)
- **Aggregates** (`aggregates/`): workflow-aggregate, execution-aggregate
- **Entities** (`entities/`): Workflow, Plan, Session, Step, Task, ExecutionContext
- **Value Objects** (`value-objects/`):
  - Identifiers: WorkflowId, PlanId, SessionId, StepId, TaskId
  - Execution: Confidence, Duration, Priority, RetryPolicy, Timeout
  - Web: URL, ElementSelector, PageState, Viewport
  - Variables: Variable, VariableString (with interpolation)
- **Domain Services** (`domain-services/`): Planning, Execution, Evaluation, WorkflowOrchestration
- **Domain Events** (`domain-events/`): Comprehensive event system with EventBus, event handlers
- **Repositories** (`repositories/`): WorkflowRepository, PlanRepository, MemoryRepository
- **Factories** (`factories/`): AgentFactory, WorkflowFactory
- **Sagas** (`sagas/`): WorkflowSaga for complex workflow orchestration

#### Infrastructure Layer (`src/infrastructure/`, `src/infra/`)
- **Services**: Browser automation (Playwright), DOM manipulation, file system, screenshot capture
- **Repositories**: In-memory implementations of domain repositories
- **Event Handlers**: Workflow logging, metrics, failure recovery

### Multi-Agent System

#### Agent Types
1. **TaskPlanner** (`core/agents/task-planner/`): Strategic planning, decomposes goals into 3-7 steps
2. **TaskExecutor** (`core/agents/task-executor/`): Tactical execution with runtime DOM discovery
3. **TaskEvaluator** (`core/agents/task-evaluator/`): Validates task completion and outcomes
4. **ErrorHandler** (`core/agents/error-handler/`): Analyzes failures and suggests recovery
5. **TaskSummarizer** (`core/agents/task-summarizer/`): Creates summaries of completed workflows
6. **FeedbackAgent** (`core/agents/feedback-agent/`): Generates user-facing feedback

#### Core Services
- **WorkflowManager** (`services/workflow-manager.ts`): Central orchestrator for agent coordination
- **StateManager** (`services/state-manager.ts`): Tracks page state and extracted data
- **MemoryService** (`services/memory-service.ts`): Learning from past executions
- **VariableManager** (`services/variable-manager.ts`): Secure handling of secrets and variables
- **TaskQueue** (`services/task-queue.ts`): Priority-based task management
- **WorkflowMonitor** (`services/workflow-monitor.ts`): Observability and monitoring

### Event-Driven Architecture

The system uses comprehensive domain events for workflow coordination:
- WorkflowStarted, WorkflowCompleted, WorkflowFailed
- StepStarted, StepCompleted, StepFailed
- TaskQueued, TaskStarted, TaskCompleted, TaskFailed
- ExecutionStarted, ExecutionCompleted

Events are handled through the EventBus with specialized handlers for logging, metrics, and failure recovery.

## Entry Points

### Multi-Agent System
- `agent-amazon-multi.ts` - Amazon automation with extraction
- `agent-github-multi.ts` - GitHub automation with authentication
- `src/init-multi-agent.ts` - Multi-agent system initializer

### Legacy System
- `agent-amazon-poc.ts` - Amazon automation (stable)
- `agent-github-poc.ts` - GitHub automation
- `src/init-agents-poc.ts` - Legacy system initializer

### Development Entry Points
- `src/init-agents.ts` - Unified initializer with feature flags
- `examples/deployment-examples.ts` - Configuration examples

## Key Patterns and Conventions

### Variable Management
```typescript
// Secrets are handled securely
new Variable({ name: 'password', value: 'secret', isSecret: true })
// Use in prompts: "Login with {{username}} and {{password}}"
```

### Workflow Execution
```typescript
// Multi-agent system
const workflow = initMultiAgent({ llm, headless: false, variables });
const result = await workflow.executeWorkflow(prompt, url);
await workflow.cleanup();
```

### Error Recovery
The system implements intelligent error recovery through:
- ErrorHandler agent for failure analysis
- Workflow replanning capabilities
- Retry policies with exponential backoff
- Domain events for failure tracking

## Testing Strategy

### Test Organization
- Unit tests alongside source files in `__tests__` directories
- Jest configuration in `jest.config.js`
- TypeScript test compilation via ts-jest

### Test Focus Areas
- Domain logic: Aggregates, entities, value objects
- Service orchestration: WorkflowManager, StateManager
- Infrastructure: Repositories, event handlers
- Agent behavior: Input/output validation, prompt handling

## Dependencies

### Core Dependencies
- **playwright**: Browser automation
- **langchain/openai**: LLM integration
- **zod**: Schema validation
- **rxjs**: Reactive programming for event handling
- **uuid**: Identifier generation
- **class-validator**: Runtime validation

### Development
- **typescript**: Type safety
- **ts-node**: Direct TypeScript execution
- **jest** (via config): Testing framework

## Important Implementation Notes

1. **DDD Boundaries**: Maintain clear separation between domain and infrastructure layers
2. **Event Sourcing**: All workflow state changes emit domain events
3. **Value Objects**: Immutable, self-validating domain concepts
4. **Aggregates**: Enforce business rules and consistency boundaries
5. **Repository Pattern**: Abstract data persistence from domain logic
6. **Factory Pattern**: Centralized object creation with dependency injection
7. **Workflow Resilience**: Built-in error recovery and replanning capabilities
8. **Memory System**: Learns from successes and failures for optimization
9. **Variable Interpolation**: Secure handling of sensitive data in prompts
10. **Screenshot Integration**: Visual understanding capability for agents

## Migration Path

When migrating from legacy to multi-agent:
1. Use `initMultiAgent()` instead of `initAgentsPoc()`
2. Update execution calls from `agent.start()` to `workflow.executeWorkflow()`
3. Add cleanup calls: `await workflow.cleanup()`
4. Leverage feature flags in `src/init-agents.ts` for gradual migration