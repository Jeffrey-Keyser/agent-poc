# Agents - Web Automation Framework

A powerful TypeScript-based web automation framework featuring both a legacy monolithic system and a modern multi-agent architecture for intelligent browser automation.

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

This repository contains two distinct automation systems:

### 1. **Legacy System (agents-poc)** 
- Single monolithic agent with a comprehensive 276-line prompt
- Battle-tested and stable
- All logic in one place
- Simple to understand but harder to maintain

### 2. **Multi-Agent System** 
- Modern modular architecture with specialized agents
- Separation of concerns (Planning, Execution, Evaluation)
- Enhanced with visual understanding (screenshots)
- Memory learning system
- Variable management for secrets
- More maintainable and cost-effective

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

#### Key Components:

- **Task Planner**: Decomposes high-level goals into strategic steps
- **Task Executor**: Executes strategic steps via micro-actions
- **Task Evaluator**: Validates task completion
- **Error Handler**: Analyzes failures and suggests recovery strategies
- **Workflow Manager**: Orchestrates agent interactions
- **State Manager**: Tracks page state and extracted data
- **Memory Service**: Learns from successes and failures
- **Variable Manager**: Handles secrets and variable interpolation

### Legacy Architecture (agents-poc)

```
┌─────────────────┐
│   User Goal     │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│    AgentsPoc            │
│  (Monolithic Agent)     │
│  - Planning             │
│  - Execution            │
│  - Evaluation           │
│  - Error Handling       │
└────────┬─────────────────┘
         │
         ▼
┌─────────────────────────┐
│   Browser + DOM Service │
└─────────────────────────┘
```

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

#### Using Multi-Agent System (Recommended)

```typescript
import { initMultiAgent } from './src/init-multi-agent';

const workflow = initMultiAgent({
  apiKey: process.env.OPENAI_API_KEY!,
  headless: false,
  variables: []
});

const result = await workflow.executeWorkflow(
  'Search for wireless headphones under $100',
  'https://amazon.com'
);

console.log('Results:', result.extractedData);
await workflow.cleanup();
```

#### Using Legacy System

```typescript
import { initAgentsPoc } from './src/init-agents-poc';
import { LLM } from './src/models';

const agent = initAgentsPoc({
  llm: new LLM({ apiKey: process.env.OPENAI_API_KEY }),
  headless: false,
  variables: []
});

const result = await agent.start(
  'https://amazon.com',
  'Search for wireless headphones under $100'
);
```

## 📁 Entry Points

### Production Entry Points

| File | System | Purpose | Usage |
|------|---------|----------|--------|
| `agent-amazon-multi.ts` | Multi-Agent | Amazon automation with extraction | `npm run amazon:multi` |
| `agent-amazon-poc.ts` | Legacy | Amazon automation (stable) | `npm run amazon:legacy` |
| `agent-github-multi.ts` | Multi-Agent | GitHub automation with auth | `npm run github:multi` |
| `agent-github-poc.ts` | Legacy | GitHub automation (stable) | `npm run github:legacy` |

### Development Entry Points

| File | Purpose |
|------|----------|
| `src/init-multi-agent.ts` | Multi-agent system initializer |
| `src/init-agents-poc.ts` | Legacy system initializer |
| `src/init-agents.ts` | Unified initializer with feature flags |

## 📊 System Comparison

| Feature | Legacy (agents-poc) | Multi-Agent |
|---------|-------------------|--------------|
| **Architecture** | Monolithic | Modular |
| **Prompt Size** | 276 lines | 50-80 lines per agent |
| **Maintainability** | Challenging | Easy |
| **Cost Efficiency** | Higher | Lower (optimized models) |
| **Visual Understanding** | Basic | Advanced (screenshots) |
| **Memory/Learning** | No | Yes |
| **Variable Management** | Basic | Advanced |
| **Error Recovery** | Limited | Intelligent replanning |
| **Strategic Planning** | Mixed with execution | Separated |
| **Debugging** | Difficult | Easy (isolated components) |
| **Test Coverage** | Limited | Comprehensive |

## ⚙️ Configuration

### Multi-Agent Configuration

```typescript
interface MultiAgentConfig {
  apiKey: string;
  headless: boolean;
  variables: Variable[];
  models?: {
    planner?: string;    // default: 'gpt-5-nano'
    executor?: string;   // default: 'gpt-5-nano'
    evaluator?: string;  // default: 'gpt-5-nano'
  };
  maxRetries?: number;   // default: 3
  timeout?: number;       // default: 300000ms
}
```

### Variable Management

```typescript
import { Variable } from './src/core/entities/variable';

const password = new Variable({
  name: 'password',
  value: process.env.PASSWORD,
  isSecret: true  // Won't be sent to LLM or logged
});

const username = new Variable({
  name: 'username',
  value: 'user@example.com',
  isSecret: false
});

// Use in prompts: "Login with {{username}} and {{password}}"
```

### Environment-Specific Configurations

```typescript
import { getDeploymentConfig } from './src/core/config/deployment-config';

// Get optimized config for environment
const config = getDeploymentConfig('production');
// or: 'development', 'testing', 'staging'
```

## 🛠️ Development

### Project Structure

```
agents/
├── src/
│   ├── core/
│   │   ├── agents/           # Agent implementations
│   │   │   ├── agents-poc/   # Legacy monolithic agent
│   │   │   ├── task-planner/ # Strategic planning agent
│   │   │   ├── task-executor/# Tactical execution agent
│   │   │   ├── task-evaluator/# Outcome evaluation agent
│   │   │   └── error-handler/# Error analysis agent
│   │   ├── services/         # Core services
│   │   │   ├── workflow-manager.ts
│   │   │   ├── state-manager.ts
│   │   │   ├── memory-service.ts
│   │   │   └── variable-manager.ts
│   │   ├── interfaces/       # TypeScript interfaces
│   │   └── types/            # Type definitions
│   ├── infra/               # Infrastructure layer
│   │   └── services/        # Browser, DOM, Reporter
│   └── models/              # LLM integrations
├── docs/                    # Documentation
├── examples/                # Usage examples
└── __tests__/              # Test suites
```

### Building

```bash
# TypeScript compilation
npm run build

# Watch mode for development
npm run dev

# Type checking only
npm run type-check
```

### Available Scripts

```bash
npm start              # Run default entry point
npm run build         # Compile TypeScript
npm run dev          # Development mode with watch
npm test             # Run test suite
npm run lint         # Run linter
npm run clean        # Clean build artifacts
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test task-executor

# Run integration tests
npm run test:integration
```

### Test Structure

```typescript
// Example test for extraction functionality
describe('TaskExecutor', () => {
  it('should extract data from page elements', async () => {
    const executor = new TaskExecutor(/*...*/);
    const result = await executor.execute({
      task: { intent: 'extract', /*...*/ },
      pageState: mockPageState
    });
    
    expect(result.finalState.extractedData).toHaveProperty('title');
    expect(result.finalState.extractedData.title).toBe('Expected Title');
  });
});
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Extraction Tasks Failing
**Problem**: Evaluator reports "No extracted data found" even when extraction succeeds.

**Solution**: This is a known bug being addressed. Temporary workaround:
- Use legacy system (`agent-amazon-poc.ts`) for extraction-heavy workflows
- Or apply the fix in `EXTRACTION_BUG_FIX_PLAN.md`

#### 2. "API key not found" Error
```bash
# Ensure API key is set
export OPENAI_API_KEY=sk-your-actual-key-here
# Or create .env file
echo "OPENAI_API_KEY=sk-your-key" > .env
```

#### 3. Browser Launch Failures
```bash
# Install Playwright browsers
npx playwright install chromium

# For headless issues, try headed mode
headless: false  # in config
```

#### 4. Memory/Performance Issues
- Reduce `maxRetries` in config
- Use smaller models for executor/evaluator
- Enable headless mode for better performance
- Clear extracted data between workflows

### Debug Mode

Enable detailed logging:

```bash
# Set debug environment variable
DEBUG=agents:* npm start

# Or in code
const workflow = initMultiAgent({
  debug: true,
  // ... other config
});
```

### Viewing Logs

- Console output: Real-time execution logs
- `output.txt`: Detailed execution history
- Screenshots: Check `screenshots/` directory
- Browser console: Available in headed mode

## 🔄 Migration Guide

### Migrating from Legacy to Multi-Agent

#### Step 1: Update Initialization

```typescript
// Before (Legacy)
import { initAgentsPoc } from './src/init-agents-poc';
const agent = initAgentsPoc({ llm, headless, variables });

// After (Multi-Agent)
import { initMultiAgent } from './src/init-multi-agent';
const workflow = initMultiAgent({ apiKey, headless, variables });
```

#### Step 2: Update Execution

```typescript
// Before (Legacy)
const result = await agent.start(url, prompt);

// After (Multi-Agent)
const result = await workflow.executeWorkflow(prompt, url);
await workflow.cleanup(); // Don't forget cleanup!
```

#### Step 3: Handle Results

```typescript
// Both systems return similar results
console.log(result.extractedData);  // Extracted information
console.log(result.status);         // 'success' | 'failure' | 'partial'
console.log(result.summary);         // Human-readable summary
```

### Feature Flags for Gradual Migration

```typescript
import { initAgents } from './src/init-agents';

// Use feature flag to switch systems
const agent = initAgents({
  useMultiAgent: true,  // Toggle this flag
  // ... other config
});
```

### Rollback Strategy

If issues arise with multi-agent system:

1. **Immediate**: Switch to legacy entry points (`*-poc.ts`)
2. **Code**: Change `useMultiAgent: false` in feature flags
3. **Git**: `git checkout <last-stable-commit>`

## 🤝 Contributing

### Development Workflow

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make Changes**
   - Follow existing patterns
   - Add tests for new functionality
   - Update documentation

3. **Test Thoroughly**
   ```bash
   npm test
   npm run lint
   npm run build
   ```

4. **Submit PR**
   - Clear description of changes
   - Link related issues
   - Include test results

### Code Style

- Use TypeScript strict mode
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Keep functions small and focused

### Testing Requirements

- Unit tests for new agents/services
- Integration tests for workflows
- Minimum 80% coverage for new code

## 📚 Additional Resources

### Documentation

- [Migration Guide](docs/MIGRATION_GUIDE.md) - Detailed migration instructions
- [Architecture Plan](MULTI_AGENT_ARCHITECTURE_PLAN.md) - System design documentation
- [Enhancement Plan](MULTI_AGENT_ENHANCEMENT_PLAN.md) - Recent improvements
- [Bug Fix Plan](EXTRACTION_BUG_FIX_PLAN.md) - Current known issues and fixes

### Examples

- [Deployment Examples](examples/deployment-examples.ts) - Environment configurations
- [Amazon Workflow](agent-amazon-multi.ts) - E-commerce automation
- [GitHub Workflow](agent-github-multi.ts) - Repository automation

### Dependencies

Key dependencies:
- **Playwright**: Browser automation
- **LangChain**: LLM integration framework
- **OpenAI SDK**: AI model access
- **Zod**: Schema validation

## 📝 License

[License Type] - See LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Search existing GitHub issues
3. Create new issue with reproduction steps
4. Contact maintainers

---

**Note**: This project is under active development. The multi-agent system is the recommended approach for new implementations, while the legacy system remains available for stability-critical applications.

Potential support:
  Certifying, loading, initializing, and unloading a given AI model
  Calling a model with context
  Parsing the output from the model
  Certifying, loading, initializing, and unloading tools
  Calling a tool
  Parsing the results from a tool call
  Storing the results from a tool call into memory
  Asking the user for input
  Adding content to a history memory
  Standard control constructs such as conditionals, sequencing, etc.