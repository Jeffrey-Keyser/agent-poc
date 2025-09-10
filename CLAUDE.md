# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a sophisticated web automation framework featuring a modern multi-agent architecture with specialized agents for intelligent browser automation.

The codebase follows Domain-Driven Design (DDD) principles with clear separation of concerns, event-driven architecture, and workflow orchestration capabilities.

## Common Commands

### Build and Development
```bash
npm run build              # Compile TypeScript to JavaScript
npm run build:run         # Build and run the compiled JavaScript
npm run dev               # Run in development mode with watch (ts-node --watch)
npm run clean             # Clean build artifacts (rm -rf dist)
```

### Running Agents
```bash
# Multi-agent system
npm run start:amazon-multi    # Amazon automation with multi-agent
npm start                     # Run main entry point (src/index.ts)
npm run dev                   # Development mode with watch
```

### Testing
```bash
npm test                      # Run Jest test suite
npm test -- path/to/test.ts  # Run specific test file
npm test -- --coverage       # Run tests with coverage report

# Test configuration:
# - Framework: Jest with ts-jest
# - Test patterns: **/__tests__/**/*.ts, **/?(*.)+(spec|test).ts
# - Coverage threshold: Not currently enforced
```

### Browser Setup
```bash
npm run install:browsers      # Install Playwright browsers
npm run postinstall          # Auto-runs after npm install (installs Chromium)
npx playwright install chromium  # Install Chromium specifically
```

### Environment Setup
```bash
# 1. Copy the example environment file
cp .env.example .env

# 2. Add your OpenAI API key to .env
# Required: OPENAI_API_KEY=sk-proj-...

# 3. Optional debug logging
# DEBUG=openai-agents:*  # Enable all debug logs
# DEBUG=openai-agents:core  # Core execution logs only
```

## Architecture

### Domain-Driven Design Structure

The codebase implements DDD with the following key components. **Note: StrategicTask to Task Entity migration is now complete** - all services use proper DDD Task entities instead of legacy StrategicTask interfaces.

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
- `src/init-multi-agent.ts` - Multi-agent system initializer
- `src/index.ts` - Main application entry point

### Development Entry Points
- `src/init-agents.ts` - Unified initializer with feature flags

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
const workflow = initMultiAgent({ apiKey, headless: false, variables });
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
- **playwright**: Browser automation (^1.55.0)
- **langchain/openai**: LLM integration (^0.4.4)
- **zod**: Schema validation (^3.24.1)
- **rxjs**: Reactive programming for event handling (^7.8.1)
- **uuid**: Identifier generation (^11.1.0)
- **class-validator**: Runtime validation (^0.14.1)
- **dotenv**: Environment variable management (^16.4.7)
- **jsdom**: DOM parsing and manipulation (^26.0.0)
- **dom-to-semantic-markdown**: HTML to markdown conversion (^1.3.0)
- **socket.io**: Real-time communication (^4.8.1)

### Development
- **typescript**: Type safety (^5.5.4)
- **ts-node**: Direct TypeScript execution (^10.9.2)
- **jest** (via config): Testing framework with ts-jest preset
- **Node.js**: Requires >=18.0.0

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
11. **Task Entity Migration**: All services now use Task entities instead of legacy StrategicTask interfaces - migration completed in Phases 1-3

## Integration Patterns

For implementing new automation workflows:
1. Use `initMultiAgent()` to initialize the workflow system
2. Execute workflows with `workflow.executeWorkflow(prompt, url)`
3. Always call cleanup: `await workflow.cleanup()`
4. Leverage domain events for monitoring and logging
5. Use proper DDD entities (Task, Plan, Step) for type safety

## TypeScript Configuration

The project uses TypeScript with the following key settings:
- **Target**: ES2020
- **Module**: CommonJS
- **Strict Mode**: Enabled
- **Decorators**: Enabled (experimentalDecorators, emitDecoratorMetadata)
- **Source Maps**: Enabled
- **Output Directory**: `dist/`
- **Path Aliases**: `@/*` maps to `src/*`

## Project Status Notes

- **Test Suite**: Comprehensive DDD testing with Jest
- **Active Development**: Multi-agent system enhancements and workflow optimization
- **Production Ready**: Multi-agent system with Domain-Driven Design architecture
- **Architecture**: Complete DDD implementation with aggregates, entities, and value objects
- **Event System**: Full event-driven architecture for workflow coordination