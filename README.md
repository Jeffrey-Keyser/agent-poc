# Web Automation Framework

A production-ready TypeScript-based web automation framework featuring a sophisticated multi-agent architecture with Domain-Driven Design (DDD) principles for intelligent browser automation.

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Entry Points](#entry-points)
- [System Comparison](#system-comparison)
- [Configuration](#configuration)
- [Development](#development)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Migration Guide](#migration-guide)
- [Contributing](#contributing)

## 🎯 Project Overview

This repository contains a production-ready multi-agent web automation system built with TypeScript and Domain-Driven Design principles:

### Key Features
- **Multi-Agent Architecture**: Specialized agents for planning, execution, evaluation, and error handling
- **Domain-Driven Design**: Clean architecture with aggregates, entities, value objects, and domain events
- **Intelligent Task Execution**: Runtime DOM discovery with micro-actions for precise browser control
- **Visual Understanding**: Screenshot analysis for enhanced context awareness
- **Memory & Learning**: Persistent memory service that learns from past executions
- **Variable Management**: Secure handling of secrets and dynamic variable interpolation
- **Event-Driven Architecture**: Comprehensive event system for workflow coordination
- **Error Recovery**: Intelligent error analysis and recovery strategies
- **Workflow Orchestration**: Advanced workflow management with state tracking

## 🏗️ Architecture

### Multi-Agent Architecture

```
┌─────────────────┐
│   User Goal     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  Task Planner   │────▶│  Strategic Plan  │
│  (Strategic)    │     │   (3-7 steps)    │
└─────────────────┘     └────────┬─────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   Workflow Manager       │
                    │  (Orchestration Layer)   │
                    └────────────┬─────────────┘
                                 │
                ┌────────────────┼────────────────┐
                ▼                ▼                ▼
       ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
       │Task Executor│  │Task Evaluator│  │Error Handler│
       │ (Tactical)  │  │ (Validation) │  │  (Recovery) │
       └─────────────┘  └─────────────┘  └─────────────┘
                │                │                │
                ▼                ▼                ▼
       ┌─────────────────────────────────────────┐
       │        Browser Automation Layer         │
       │    (Playwright + DOM Service)           │
       └─────────────────────────────────────────┘
```

### Core Components

#### Agents
- **TaskPlanner**: Strategic decomposition of high-level goals into actionable steps (3-7 steps)
- **TaskExecutor**: Tactical execution using micro-actions with runtime DOM discovery
- **TaskEvaluator**: Validates task completion and success criteria
- **ErrorHandler**: Intelligent failure analysis and recovery strategy generation
- **TaskSummarizer**: Creates structured summaries of completed workflows

#### Core Services
- **WorkflowManager**: Central orchestrator for multi-agent coordination
- **StateManager**: Tracks page state, DOM changes, and extracted data
- **MemoryService**: Persistent learning from past executions
- **VariableManager**: Secure secret handling and variable interpolation
- **TaskQueue**: Priority-based task management
- **WorkflowMonitor**: Real-time observability and metrics
- **DomainEventBridge**: Event coordination across bounded contexts


## 🚀 Quick Start

### Prerequisites

- **Node.js** 18 or higher
- **npm** or **yarn**
- **OpenAI API Key** (or compatible LLM API key)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd agents

# Install dependencies
npm install

# Set up environment variables
export OPENAI_API_KEY=sk-your-api-key-here
```

### Basic Usage

```typescript
import { initMultiAgent } from './src/init-multi-agent';
import { ChatOpenAI } from './src/models/chat-openai';

// Initialize LLM
const llm = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini'
});

// Initialize multi-agent workflow
const workflow = initMultiAgent({
  llm,
  headless: false,
  verbose: true,
  viewport: { width: 1280, height: 720 },
  variables: []
});

// Execute automation workflow
const result = await workflow.executeWorkflow(
  'Search for wireless headphones under $100',
  'https://amazon.com'
);

console.log('Results:', result.extractedData);
await workflow.cleanup();
```

## 📁 Entry Points

### Main Entry Points

| File | Purpose | Usage |
|------|----------|--------|
| `agent-amazon-multi.ts` | Amazon automation example with multi-agent system | `npm start` or `npm run start:multi` |
| `src/index.ts` | Library exports for programmatic use | Import in your code |
| `src/init-multi-agent.ts` | Multi-agent system factory | Core initialization |

## 🏗️ Architecture Features

| Feature | Implementation |
|---------|----------------|
| **Architecture Pattern** | Domain-Driven Design with multi-agent system |
| **Design Principles** | SOLID, Clean Architecture, Bounded Contexts |
| **Agent Specialization** | Focused agents with single responsibilities |
| **Prompt Engineering** | Optimized 50-80 line prompts per agent |
| **Model Optimization** | Agent-specific model selection for cost efficiency |
| **Visual Understanding** | Screenshot analysis with DOM correlation |
| **Memory System** | Persistent learning with success/failure tracking |
| **Variable Management** | Secure secrets with interpolation support |
| **Error Recovery** | Intelligent failure analysis and replanning |
| **Task Execution** | Micro-actions with runtime DOM discovery |
| **Event Architecture** | Comprehensive domain events with EventBus |
| **Observability** | Real-time monitoring and metrics |

## ⚙️ Configuration

### Multi-Agent Configuration

```typescript
interface InitMultiAgentConfig {
  llm: LLM;                    // LLM instance (e.g., ChatOpenAI)
  headless: boolean;           // Browser headless mode
  verbose: boolean;            // Enable detailed logging
  viewport: {                  // Browser viewport
    width: number;
    height: number;
  };
  variables?: Variable[];      // Secret/variable management
  maxRetries?: number;         // Max retry attempts (default: 3)
  timeout?: number;            // Execution timeout in ms (default: 300000)
  startUrl?: string;           // Initial browser URL
}
```

### Variable Management

```typescript
import { Variable } from './src/core/value-objects/variable';

// Secure handling of secrets
const password = Variable.create({
  name: 'password',
  value: process.env.PASSWORD!,
  isSecret: true  // Won't be sent to LLM or logged
}).getValue();

const username = Variable.create({
  name: 'username',
  value: 'user@example.com',
  isSecret: false
}).getValue();

// Variables are automatically interpolated in prompts:
// "Login with {{username}} and {{password}}"
```

### LLM Configuration

```typescript
import { ChatOpenAI } from './src/models/chat-openai';

// Configure OpenAI model
const llm = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',  // or 'gpt-4', 'gpt-3.5-turbo'
  temperature: 0.7,
  maxTokens: 2000
});
```

## 🛠️ Development

### Project Structure

```
web-automation-framework/
├── src/
│   ├── core/                     # Domain layer (DDD)
│   │   ├── aggregates/          # Workflow & Execution aggregates
│   │   ├── entities/            # Plan, Step, Task, Session, Workflow
│   │   ├── value-objects/       # Immutable domain concepts
│   │   │   ├── identifiers/     # WorkflowId, TaskId, etc.
│   │   │   ├── execution/       # Confidence, Duration, Priority
│   │   │   ├── task/            # MicroAction, Intent, Evidence
│   │   │   ├── web/             # URL, PageState, ElementSelector
│   │   │   └── variable.ts      # Variable with interpolation
│   │   ├── domain-services/     # Planning, Execution, Evaluation
│   │   ├── domain-events/       # Event definitions and EventBus
│   │   ├── repositories/        # Repository interfaces
│   │   ├── factories/           # AgentFactory, WorkflowFactory
│   │   ├── sagas/              # WorkflowSaga for orchestration
│   │   ├── agents/             # Agent implementations
│   │   │   ├── task-planner/   # Strategic planning (3-7 steps)
│   │   │   ├── task-executor/  # Tactical execution with micro-actions
│   │   │   ├── task-evaluator/ # Success validation
│   │   │   ├── error-handler/  # Failure analysis & recovery
│   │   │   └── task-summarizer/# Workflow summarization
│   │   ├── services/           # Core application services
│   │   │   ├── workflow-manager.ts    # Central orchestrator
│   │   │   ├── state-manager.ts       # Page state tracking
│   │   │   ├── memory-service.ts      # Learning system
│   │   │   ├── variable-manager.ts    # Variable handling
│   │   │   ├── task-queue.ts          # Priority queue
│   │   │   ├── workflow-monitor.ts    # Observability
│   │   │   └── domain-event-bridge.ts # Event coordination
│   │   ├── interfaces/         # Core interfaces (LLM, etc.)
│   │   └── types/              # Type definitions
│   ├── infrastructure/         # Infrastructure implementations
│   │   ├── repositories/       # In-memory repositories
│   │   ├── services/          # Infrastructure services
│   │   └── event-handlers/    # Event handler implementations
│   ├── infra/                 # Browser automation layer
│   │   └── services/
│   │       ├── chromium-browser.ts      # Playwright browser
│   │       ├── dom-service.ts           # DOM manipulation
│   │       ├── playwright-screenshotter.ts # Screenshots
│   │       └── console-reporter.ts      # Console output
│   └── models/                # LLM integrations
│       └── chat-openai.ts     # OpenAI integration
├── docs/                      # Architecture & design docs
├── agent-amazon-multi.ts      # Example implementation
└── package.json              # Dependencies & scripts
```

### Building

```bash
# TypeScript compilation
npm run build

# Build and run
npm run build:run

# Development mode with watch
npm run dev

# Clean build artifacts
npm run clean
```

### Available Scripts

```bash
npm start                     # Run Amazon multi-agent example
npm run start:multi          # Same as npm start
npm run dev                  # Development mode with watch
npm run build                # Compile TypeScript to JavaScript
npm run build:run            # Build and run compiled code
npm run clean                # Remove dist directory
npm run install:browsers     # Install Playwright browsers
npm test                     # Run test suite (placeholder)
```

## 🧪 Testing

### Test Status

Currently, the project has unit tests for core DDD components. The test suite is being expanded.

```bash
# Run tests (currently placeholder)
npm test

# Test files are located alongside source files
src/core/aggregates/__tests__/
src/core/entities/__tests__/
src/core/value-objects/__tests__/
```

### Test Architecture

- **Unit Tests**: Domain logic, value objects, entities, aggregates
- **Integration Tests**: Service orchestration, workflow execution
- **Component Tests**: Individual agent behavior
- **E2E Tests**: Full workflow automation scenarios

## 🔧 Troubleshooting

### Common Issues

#### 1. "API key not found" Error
```bash
# Set environment variable
export OPENAI_API_KEY=sk-your-actual-key-here

# Or create .env file from template
cp .env.example .env
# Edit .env and add your API key
```

#### 2. Browser Launch Failures
```bash
# Install Playwright browsers
npm run install:browsers
# or
npx playwright install chromium

# For headless issues, set headless: false in config
```

#### 3. Task Execution Failures
The system includes intelligent error recovery:
- **Automatic Retry**: Exponential backoff with configurable max retries
- **Error Analysis**: ErrorHandler agent analyzes failures
- **Recovery Strategies**: Automatic replanning on failures
- **DOM Changes**: Runtime discovery adapts to page changes

#### 4. Performance Optimization
- Use `headless: true` for better performance
- Adjust `viewport` size to reduce rendering overhead
- Configure appropriate `timeout` values
- Use `verbose: false` in production

### Debug Mode

Enable detailed logging:

```bash
# Environment variables for debugging
DEBUG=openai-agents:* npm start     # All debug logs
DEBUG=openai-agents:core npm start  # Core execution only

# In code
const workflow = initMultiAgent({
  verbose: true,  // Enable verbose logging
  headless: false, // See browser actions
  // ... other config
});
```

### Logging & Output

- **Console Output**: Real-time execution logs with agent decisions
- **Screenshots**: Captured on failures (when screenshotter is configured)
- **Browser Console**: Available in headed mode (`headless: false`)
- **Event Logs**: Domain events tracked via EventBus

## 🔧 Advanced Usage

### Workflow Orchestration

```typescript
import { initMultiAgent } from './src/init-multi-agent';
import { ChatOpenAI } from './src/models/chat-openai';
import { Variable } from './src/core/value-objects/variable';

// Configure LLM with specific model
const llm = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',
  temperature: 0.7
});

// Initialize with advanced configuration
const workflow = initMultiAgent({
  llm,
  headless: false,
  verbose: true,
  viewport: { width: 1920, height: 1080 },
  maxRetries: 5,
  timeout: 600000, // 10 minutes
  startUrl: 'https://google.com',
  variables: [
    Variable.create({ 
      name: 'apiKey', 
      value: process.env.API_KEY!, 
      isSecret: true 
    }).getValue()
  ]
});

// Execute complex workflow
const result = await workflow.executeWorkflow(
  'Navigate to Amazon, search for laptops, extract top 5 results with prices',
  'https://amazon.com'
);

// Access results
console.log('Extracted Data:', result.extractedData);
console.log('Execution Steps:', result.steps);
console.log('Success:', result.success);

await workflow.cleanup();
```

### Event-Driven Monitoring

```typescript
// Subscribe to domain events for monitoring
const eventBus = workflow.getEventBus();

eventBus.subscribe('WorkflowStarted', (event) => {
  console.log(`Workflow ${event.workflowId} started`);
});

eventBus.subscribe('StepCompleted', (event) => {
  console.log(`Step completed: ${event.description}`);
});

eventBus.subscribe('TaskFailed', (event) => {
  console.error(`Task failed: ${event.error}`);
});

eventBus.subscribe('WorkflowCompleted', (event) => {
  console.log(`Workflow completed in ${event.duration}ms`);
});
```

### Custom Error Handling

```typescript
try {
  const result = await workflow.executeWorkflow(prompt, url);
  
  if (!result.success) {
    // Handle partial success
    console.log('Partial results:', result.extractedData);
    console.log('Failed steps:', result.steps.filter(s => !s.success));
  }
} catch (error) {
  // Handle complete failure
  console.error('Workflow failed:', error);
} finally {
  await workflow.cleanup();
}
```

## 🤝 Contributing

### Development Guidelines

1. **Architecture Principles**
   - Follow Domain-Driven Design patterns
   - Maintain clear separation between domain and infrastructure
   - Use value objects for immutable concepts
   - Implement aggregates for consistency boundaries

2. **Code Standards**
   - TypeScript strict mode enabled
   - Use Result<T> pattern for error handling
   - Implement proper validation in value objects
   - Follow existing naming conventions

3. **Testing Requirements**
   - Add unit tests for domain logic
   - Test value object validation
   - Mock infrastructure dependencies
   - Aim for high test coverage

4. **Agent Development**
   - Keep prompts focused (50-80 lines)
   - Single responsibility per agent
   - Use micro-actions for browser interaction
   - Implement proper error handling

## 📚 Additional Resources

### Architecture Documentation

Located in the `/docs` directory:
- [Multi-Agent Architecture Plan](docs/MULTI_AGENT_ARCHITECTURE_PLAN.md) - System design
- [DDD Integration Plan](docs/DDD_INTEGRATION_PLAN.md) - Domain-Driven Design patterns
- [Workflow Resilience Plan](docs/WORKFLOW_RESILIENCE_PLAN.md) - Error handling strategies
- [Visual Workflow Implementation](docs/VISUAL_WORKFLOW_IMPLEMENTATION_PLAN.md) - Screenshot integration
- [Task Executor Separation](docs/TASK_EXECUTOR_SEPARATION_PLAN.md) - Micro-action architecture

### Key Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| **playwright** | Browser automation | ^1.55.0 |
| **@langchain/openai** | OpenAI LLM integration | ^0.4.4 |
| **rxjs** | Reactive event handling | ^7.8.1 |
| **zod** | Schema validation | ^3.24.1 |
| **uuid** | Unique identifiers | ^11.1.0 |
| **jsdom** | DOM parsing | ^26.0.0 |
| **dom-to-semantic-markdown** | HTML to markdown | ^1.3.0 |
| **class-validator** | Runtime validation | ^0.14.1 |
| **dotenv** | Environment variables | ^16.4.7 |

### Example Implementation

See [agent-amazon-multi.ts](agent-amazon-multi.ts) for a complete example of:
- Multi-agent workflow initialization
- E-commerce automation
- Data extraction
- Error handling

## 📝 License

MIT License - See LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review architecture documentation in `/docs`
3. Search existing GitHub issues
4. Create a new issue with:
   - Clear problem description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node version, OS)

---

**Note**: This is a production-ready web automation framework implementing a sophisticated multi-agent system with Domain-Driven Design principles, intelligent error recovery, and comprehensive workflow orchestration capabilities.