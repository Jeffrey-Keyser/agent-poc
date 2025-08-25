# Multi-Agent Architecture Implementation Plan

## Executive Summary

This document outlines a comprehensive plan to refactor the current monolithic agent system into a specialized multi-agent architecture. The new system will separate concerns between planning, execution, and evaluation, resulting in more maintainable, cost-effective, and reliable automation.

## Current System Analysis

### Problems with Current Implementation

1. **Monolithic Prompt Complexity**
   - Single 276-line prompt (`agents-poc.prompt.ts`) handles all logic
   - Mixes strategic planning with tactical execution
   - Contains contradictory instructions
   - Cognitive overload for the LLM

2. **Lack of Separation of Concerns**
   - Same LLM instance handles planning and execution
   - No dedicated evaluation layer
   - Task history accumulates and pollutes context

3. **Cost Inefficiency**
   - Uses high-capability models for simple tasks
   - Entire context passed on every iteration
   - No optimization for different cognitive complexity levels

## Proposed Architecture

### System Overview

```
┌─────────────────┐
│   User Goal     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  Task Planner   │────▶│  Task Queue      │
│ (GPT-5-mini)    │     │  (In-Memory)     │
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
       │ (GPT-5-nano)│  │ (GPT-5-nano)│  │ (GPT-5-nano)│
       └─────────────┘  └─────────────┘  └─────────────┘
                │                │                │
                ▼                ▼                ▼
       ┌─────────────────────────────────────────┐
       │        Browser Automation Layer         │
       │    (Playwright + DOM Service)           │
       └─────────────────────────────────────────┘
```

### Agent Responsibilities

| Agent | Purpose | Model | Input | Output |
|-------|---------|--------|--------|---------|
| Task Planner | Decompose goals into HIGH-LEVEL strategic steps | gpt-5-mini | High-level goal + current state | Strategic plan (3-7 steps) |
| Task Executor | Execute ONE strategic step via multiple micro-actions | gpt-5-mini | Single strategic step + DOM state | Series of browser actions |
| Task Evaluator | Validate strategic step completion | gpt-5-mini | Expected vs actual state | Success/Failure + reason |
| Error Handler | Analyze failures and suggest fixes | gpt-5-mini | Error context | Retry strategy |
| Workflow Manager | Orchestrate agent interactions | Code | Agent outputs | State transitions |

#### Key Distinction: Strategic vs Tactical
- **Strategic (Planner)**: "Search for wireless headphones", "Apply price filter", "Extract results"
- **Tactical (Executor)**: "Click element at index 42", "Type text in input field", "Press Enter key"
- **The Planner thinks like a human user, the Executor handles implementation details**

## Implementation Plan

### Phase 1: Core Interfaces and Base Classes

#### 1.1 Create Agent Interfaces
**File**: `src/core/interfaces/agent.interface.ts`

```typescript
export interface IAgent<TInput, TOutput> {
  name: string;
  model: string;
  maxRetries: number;
  
  execute(input: TInput): Promise<TOutput>;
  validateInput(input: TInput): boolean;
  validateOutput(output: TOutput): boolean;
}

export interface ITaskPlanner extends IAgent<PlannerInput, PlannerOutput> {
  replan(context: ReplanContext): Promise<PlannerOutput>;
}

export interface ITaskExecutor extends IAgent<ExecutorInput, ExecutorOutput> {
}

export interface ITaskEvaluator extends IAgent<EvaluatorInput, EvaluatorOutput> {
}
```

#### 1.2 Define Data Types
**File**: `src/core/types/agent-types.ts`

```typescript
// Strategic level - what the Planner creates
export interface StrategicTask {
  id: string;
  name: string;
  description: string;
  intent: 'search' | 'filter' | 'navigate' | 'extract' | 'authenticate' | 'verify' | 'interact';
  targetConcept: string; // e.g., "search box", "price filter", "results list" - NOT selectors
  inputData?: any; // High-level data, e.g., "wireless headphones", "$100"
  expectedOutcome: string; // User-observable outcome, not technical details
  dependencies: string[];
  maxAttempts: number;
  priority: number;
}

// Tactical level - what the Executor creates at runtime
export interface MicroAction {
  type: 'click' | 'fill' | 'scroll' | 'wait' | 'extract' | 'press_key';
  selector?: string; // Determined at execution time from DOM
  elementIndex?: number; // Index from getInteractiveElements()
  value?: any;
  element?: DOMElement; // Actual element from current page state
}

export interface StrategicPlan {
  id: string;
  goal: string;
  steps: StrategicTask[]; // 3-7 high-level steps
  createdAt: Date;
  currentStepIndex: number;
}

export interface StepResult {
  stepId: string;
  status: 'success' | 'failure' | 'partial';
  microActions: MicroAction[]; // What was actually executed
  evidence: {
    beforeState?: PageState;
    afterState?: PageState;
    extractedData?: any;
  };
  errorReason?: string;
  duration: number;
  attempts: number;
}

export interface PageState {
  url: string;
  title: string;
  visibleSections: string[]; // High-level page areas
  availableActions: string[]; // What user can do
  extractedData?: any;
}
```

### Phase 2: Implement Specialized Agents

#### 2.1 Task Planner Agent
**File**: `src/core/agents/task-planner/task-planner.ts`

```typescript
export class TaskPlannerAgent implements ITaskPlanner {
  constructor(
    private llm: LLM,
    private config: PlannerConfig
  ) {}

  async execute(input: PlannerInput): Promise<PlannerOutput> {
    const prompt = this.buildPrompt(input);
    const response = await this.llm.invoke(prompt);
    return this.parseResponse(response);
  }

  private buildPrompt(input: PlannerInput): string {
    return `
      You are a Task Planning Agent. Your role is to decompose high-level goals
      into atomic, executable tasks.
      
      Goal: ${input.goal}
      Current URL: ${input.currentUrl}
      Constraints: ${input.constraints}
      
      Rules:
      1. Each task must be atomic (single action)
      2. Tasks must have clear success criteria
      3. Include dependencies between tasks
      4. Prioritize tasks by importance
      
      Output Format:
      {
        "tasks": [
          {
            "id": "task-1",
            "name": "Navigate to login page",
            "type": "navigate",
            "expectedOutcome": "URL contains '/login'",
            "dependencies": [],
            "priority": 1
          }
        ]
      }
    `;
  }
}
```

**File**: `src/core/agents/task-planner/task-planner.prompt.ts`

```typescript
export const TASK_PLANNER_PROMPT = `
You are a Strategic Planning Agent responsible for creating HIGH-LEVEL plans.
Think like a human user, NOT like a programmer.

CORE RESPONSIBILITIES:
1. Analyze user goals
2. Create strategic steps (NOT implementation details)
3. Focus on WHAT to do, not HOW to do it
4. Use natural, non-technical language

STRATEGIC STEP TYPES (intent):
- search: Find something on the page/site
- filter: Narrow down or refine results
- navigate: Go to a different section/page
- extract: Gather specific information
- authenticate: Login or logout
- verify: Confirm an action succeeded
- interact: Perform a user action (submit, save, etc.)

PLANNING RULES:
1. Maximum 7 strategic steps per plan (prefer 3-5)
2. Each step should represent a complete user intention
3. Use natural language, avoid technical terms
4. NO DOM selectors, element IDs, or CSS classes
5. Think in terms of what a user would tell a friend

GOOD EXAMPLE:
Goal: "Search for wireless headphones under $100 and show top 3"
Plan:
1. Search for "wireless headphones"
2. Apply price filter (maximum $100)
3. Extract the top 3 results

BAD EXAMPLE (too technical/detailed):
1. Click element #twotabsearchtextbox
2. Type "wireless headphones" in input[name='field-keywords']
3. Click button.nav-search-submit
4. Wait for div.s-main-slot to load
5. Find input#high-price
6. Enter "100" in price field
[... continues with technical details]

OUTPUT FORMAT:
{
  "strategy": [
    {
      "step": 1,
      "intent": "search",
      "description": "Search for wireless headphones",
      "targetConcept": "main search functionality",
      "inputData": "wireless headphones",
      "expectedResult": "Search results showing headphone products"
    },
    {
      "step": 2,
      "intent": "filter", 
      "description": "Apply price filter up to $100",
      "targetConcept": "price filtering options",
      "inputData": { "maxPrice": 100 },
      "expectedResult": "Results filtered to show only items under $100"
    }
  ]
}

Remember: You are planning what a HUMAN would do, not programming a bot.
`;
```

#### 2.2 Task Executor Agent
**File**: `src/core/agents/task-executor/task-executor.ts`

```typescript
export class TaskExecutorAgent implements ITaskExecutor {
  constructor(
    private llm: LLM,
    private browser: Browser,
    private domService: DomService
  ) {}

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const strategicStep = input.task;
    let pageState = await this.domService.getInteractiveElements();
    
    // NEW: Decompose strategic step into micro-actions based on current DOM
    const microActions = await this.decomposeStep(strategicStep, pageState);
    
    // Execute each micro-action
    const results = [];
    for (const action of microActions) {
      try {
        // Find the actual element based on current page state
        const element = await this.findElement(action, pageState);
        
        // Execute the micro-action
        const result = await this.executeAction(action, element);
        results.push(result);
        
        // Re-evaluate page state after significant actions
        if (this.shouldRefreshState(action)) {
          await this.wait(500); // Brief wait for page updates
          pageState = await this.domService.getInteractiveElements();
        }
      } catch (error) {
        results.push({ action, error: error.message });
        break; // Stop execution on error
      }
    }
    
    return {
      taskId: strategicStep.id,
      microActions: microActions,
      results: results,
      finalState: await this.captureState(),
      timestamp: new Date()
    };
  }

  private async decomposeStep(step: StrategicTask, pageState: PageState): Promise<MicroAction[]> {
    const prompt = `
      You are translating a high-level user intent into specific browser actions.
      
      STRATEGIC GOAL: ${step.description}
      USER INTENT: ${step.intent}
      TARGET CONCEPT: ${step.targetConcept}
      INPUT DATA: ${JSON.stringify(step.inputData)}
      
      CURRENT PAGE ELEMENTS:
      ${this.formatElements(pageState.elements)}
      
      Break this down into specific micro-actions using the available elements.
      Consider the user's intent and find the appropriate elements to interact with.
      
      Return a sequence of micro-actions like:
      [
        { "type": "click", "elementIndex": 5, "description": "Click search box" },
        { "type": "fill", "elementIndex": 5, "value": "wireless headphones" },
        { "type": "press_key", "key": "Enter" }
      ]
      
      IMPORTANT:
      - Use elementIndex from the current page elements list
      - Keep actions simple and atomic
      - Include brief descriptions for debugging
    `;
    
    const response = await this.llm.invoke(prompt);
    return this.parseMicroActions(response);
  }

  private shouldRefreshState(action: MicroAction): boolean {
    // Refresh after actions that likely change the page
    return ['click', 'press_key', 'fill'].includes(action.type) && 
           action.type !== 'fill'; // Don't refresh after every keystroke
  }

  private async findElement(action: MicroAction, pageState: any): Promise<any> {
    if (action.elementIndex !== undefined) {
      return pageState.elements[action.elementIndex];
    }
    // Fallback: try to find element by description/context
    return this.searchForElement(action, pageState);
  }
}
```

**File**: `src/core/agents/task-executor/task-executor.prompt.ts`

```typescript
export const TASK_EXECUTOR_PROMPT = `
You are a specialized Task Executor focused on completing single atomic tasks.

YOUR ONLY JOB:
Execute the specific task given to you. Nothing more, nothing less.

AVAILABLE ACTIONS:
- click(index): Click element at index
- fill(index, text): Fill input at index with text
- scroll(direction): Scroll up or down
- wait(seconds): Wait for specified time
- extract(): Extract visible text

RULES:
1. Execute ONLY the given task
2. Use ONLY elements visible on page
3. Return ONLY the action to perform
4. Do not plan ahead
5. Do not question the task

OUTPUT:
Single JSON object with action details
`;
```

#### 2.3 Task Evaluator Agent
**File**: `src/core/agents/task-evaluator/task-evaluator.ts`

```typescript
export class TaskEvaluatorAgent implements ITaskEvaluator {
  constructor(
    private llm: LLM,
    private config: EvaluatorConfig
  ) {}

  async execute(input: EvaluatorInput): Promise<EvaluatorOutput> {
    const prompt = this.buildPrompt(input);
    const evaluation = await this.llm.invoke(prompt);
    
    return {
      taskId: input.taskId,
      success: evaluation.success,
      confidence: evaluation.confidence,
      evidence: evaluation.evidence,
      reason: evaluation.reason,
      suggestions: evaluation.suggestions
    };
  }

  private buildPrompt(input: EvaluatorInput): string {
    return `
      You are a Task Evaluator. Determine if this task succeeded:
      
      Task: ${input.task.name}
      Expected: ${input.task.expectedOutcome}
      
      Before State: ${input.beforeState}
      After State: ${input.afterState}
      
      Evidence to consider:
      - URL changes
      - DOM changes
      - Visible text changes
      - Error messages
      
      Respond with:
      {
        "success": true/false,
        "confidence": 0.0-1.0,
        "evidence": "what proves success/failure",
        "reason": "why it succeeded/failed"
      }
    `;
  }
}
```

**File**: `src/core/agents/task-evaluator/task-evaluator.prompt.ts`

```typescript
export const TASK_EVALUATOR_PROMPT = `
You are a binary Task Evaluator. Your job is to determine SUCCESS or FAILURE.

EVALUATION CRITERIA:
1. Compare expected outcome with actual state
2. Look for concrete evidence
3. Be objective and factual
4. Provide confidence score

SUCCESS INDICATORS:
- Expected elements are present
- URLs match expected patterns
- Success messages appear
- Data was extracted

FAILURE INDICATORS:
- Error messages present
- Expected elements missing
- Page didn't change
- Wrong page loaded

OUTPUT:
Binary decision with evidence and confidence
`;
```

### Phase 3: Workflow Orchestration

#### 3.1 Workflow Manager
**File**: `src/core/services/workflow-manager.ts`

```typescript
export class WorkflowManager {
  private taskQueue: Queue<AtomicTask>;
  private completedTasks: Map<string, TaskResult>;
  private currentTask: AtomicTask | null = null;
  private retryCount: Map<string, number>;
  
  constructor(
    private planner: ITaskPlanner,
    private executor: ITaskExecutor,
    private evaluator: ITaskEvaluator,
    private errorHandler: IErrorHandler,
    private eventBus: EventBus
  ) {
    this.taskQueue = new Queue();
    this.completedTasks = new Map();
    this.retryCount = new Map();
  }

  async executeWorkflow(goal: string): Promise<WorkflowResult> {
    this.eventBus.emit('workflow:planning', { goal });
    const plan = await this.planner.execute({
      goal,
      currentUrl: await this.browser.getUrl(),
      constraints: this.config.constraints
    });
    
    this.queueTasks(plan.tasks);
    
    while (!this.taskQueue.isEmpty()) {
      const task = this.taskQueue.dequeue();
      
      if (!this.areDependenciesMet(task)) {
        this.taskQueue.enqueue(task); // Re-queue
        continue;
      }
      
      const result = await this.executeTask(task);
      
      if (result.status === 'success') {
        this.completedTasks.set(task.id, result);
      } else {
        await this.handleFailure(task, result);
      }
    }
    
    return this.buildWorkflowResult();
  }

  private async executeTask(task: AtomicTask): Promise<TaskResult> {
    this.currentTask = task;
    this.eventBus.emit('task:started', { task });
    
    try {
      const beforeState = await this.captureState();
      const execution = await this.executor.execute({ task });
      const afterState = await this.captureState();
      
      const evaluation = await this.evaluator.execute({
        task,
        beforeState,
        afterState,
        execution
      });
      
      const result: TaskResult = {
        taskId: task.id,
        status: evaluation.success ? 'success' : 'failure',
        evidence: evaluation.evidence,
        errorReason: evaluation.reason,
        duration: execution.duration,
        attempts: this.retryCount.get(task.id) || 1
      };
      
      this.eventBus.emit('task:completed', { task, result });
      return result;
      
    } catch (error) {
      return this.handleExecutionError(task, error);
    }
  }

  private async handleFailure(task: AtomicTask, result: TaskResult) {
    const retries = this.retryCount.get(task.id) || 0;
    
    if (retries < task.maxAttempts) {
      const strategy = await this.errorHandler.analyze({
        task,
        result,
        retries
      });
      
      if (strategy.shouldRetry) {
        const modifiedTask = this.applyRetryStrategy(task, strategy);
        this.retryCount.set(task.id, retries + 1);
        this.taskQueue.enqueuePriority(modifiedTask);
      } else if (strategy.shouldReplan) {
        await this.triggerReplan(task, result);
      } else {
        this.completedTasks.set(task.id, result);
      }
    } else {
      this.completedTasks.set(task.id, result);
      this.eventBus.emit('task:failed', { task, result });
    }
  }
}
```

#### 3.2 Dynamic Replanning and Adaptive Execution
**File**: `src/core/services/workflow-manager.ts` (additions)

```typescript
export class WorkflowManager {
  // ... existing code ...
  
  async executeWorkflow(goal: string, startUrl?: string): Promise<WorkflowResult> {
    this.startTime = new Date();
    
    // Initialize browser
    await this.browser.launch(startUrl || 'https://amazon.com');
    
    // Get initial high-level strategic plan
    let strategy = await this.planner.execute({
      goal,
      currentState: await this.captureSemanticState()
    });
    
    // Execute strategic steps with adaptive replanning
    for (let i = 0; i < strategy.steps.length; i++) {
      const strategicStep = strategy.steps[i];
      const result = await this.executeStrategicStep(strategicStep);
      
      if (!result.success) {
        // Replan from current state when a step fails
        this.reporter.log(`⚠️ Step failed, requesting replan...`);
        
        strategy = await this.planner.replan({
          originalGoal: goal,
          completedSteps: strategy.steps.slice(0, i),
          failedStep: strategicStep,
          failureReason: result.errorReason,
          currentState: await this.captureSemanticState()
        });
        
        // Start from the new plan
        i = -1; // Will be incremented to 0
      }
    }
    
    return this.buildWorkflowResult();
  }
  
  private async executeStrategicStep(step: StrategicTask): Promise<StepResult> {
    this.eventBus.emit('step:started', { step });
    
    try {
      // Capture state before execution
      const beforeState = await this.captureSemanticState();
      
      // Executor decomposes the strategic step based on current DOM
      const execution = await this.executor.execute({
        task: step,
        pageState: await this.domService.getInteractiveElements()
      });
      
      // Capture state after execution
      const afterState = await this.captureSemanticState();
      
      // Evaluate at the strategic level (did we achieve the intent?)
      const evaluation = await this.evaluator.execute({
        step: step,
        beforeState: beforeState,
        afterState: afterState,
        microActions: execution.microActions,
        results: execution.results
      });
      
      this.eventBus.emit('step:completed', { 
        step, 
        result: evaluation,
        microActions: execution.microActions 
      });
      
      return evaluation;
      
    } catch (error) {
      return {
        stepId: step.id,
        success: false,
        errorReason: error.message,
        microActions: []
      };
    }
  }
  
  private async captureSemanticState(): Promise<PageState> {
    // Capture high-level semantic state, not full DOM
    const url = this.browser.getPageUrl();
    const title = await this.browser.getTitle();
    
    // Use DOM service to identify high-level page structure
    const domState = await this.domService.getInteractiveElements();
    
    return {
      url,
      title,
      visibleSections: this.identifyPageSections(domState),
      availableActions: this.identifyAvailableActions(domState),
      extractedData: this.currentExtractedData
    };
  }
  
  private identifyPageSections(domState: any): string[] {
    // Identify semantic sections like "search bar", "filters", "results"
    const sections = [];
    
    if (domState.hasSearchInput) sections.push('search bar');
    if (domState.hasFilters) sections.push('filter panel');
    if (domState.hasResults) sections.push('results section');
    if (domState.hasNavigation) sections.push('navigation menu');
    
    return sections;
  }
}
```

#### 3.3 Task Queue Implementation
**File**: `src/core/services/task-queue.ts`

```typescript
export class TaskQueue {
  private queue: AtomicTask[] = [];
  private priorityQueue: AtomicTask[] = [];
  
  enqueue(task: AtomicTask): void {
    this.queue.push(task);
    this.sort();
  }
  
  enqueuePriority(task: AtomicTask): void {
    this.priorityQueue.push(task);
  }
  
  dequeue(): AtomicTask | null {
    if (this.priorityQueue.length > 0) {
      return this.priorityQueue.shift()!;
    }
    return this.queue.shift() || null;
  }
  
  private sort(): void {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.dependencies.length - b.dependencies.length;
    });
  }
  
  isEmpty(): boolean {
    return this.queue.length === 0 && this.priorityQueue.length === 0;
  }
}
```

#### 3.4 State Management
**File**: `src/core/services/state-manager.ts`

```typescript
export class StateManager {
  private stateHistory: PageState[] = [];
  private currentState: PageState | null = null;
  private extractedData: Map<string, any> = new Map();
  
  async captureState(browser: Browser, domService: DomService): Promise<PageState> {
    const state: PageState = {
      url: browser.getPageUrl(),
      title: await browser.getTitle(),
      visibleSections: await this.identifyPageSections(domService),
      availableActions: await this.identifyPossibleActions(domService),
      extractedData: Object.fromEntries(this.extractedData)
    };
    
    this.stateHistory.push(state);
    this.currentState = state;
    return state;
  }
  
  async identifyPageSections(domService: DomService): Promise<string[]> {
    // Semantic identification of page sections
    const elements = await domService.getInteractiveElements();
    const sections = new Set<string>();
    
    // Look for common patterns
    if (this.hasSearchElements(elements)) sections.add('search functionality');
    if (this.hasFilterElements(elements)) sections.add('filtering options');
    if (this.hasResultsGrid(elements)) sections.add('results display');
    if (this.hasLoginElements(elements)) sections.add('authentication section');
    if (this.hasNavigationMenu(elements)) sections.add('navigation menu');
    if (this.hasShoppingCart(elements)) sections.add('shopping cart');
    
    return Array.from(sections);
  }
  
  async identifyPossibleActions(domService: DomService): Promise<string[]> {
    const elements = await domService.getInteractiveElements();
    const actions = new Set<string>();
    
    // Identify what user can do on current page
    if (this.canSearch(elements)) actions.add('search for products');
    if (this.canFilter(elements)) actions.add('apply filters');
    if (this.canSort(elements)) actions.add('sort results');
    if (this.canNavigate(elements)) actions.add('navigate to other pages');
    if (this.canAddToCart(elements)) actions.add('add items to cart');
    if (this.canLogin(elements)) actions.add('login to account');
    
    return Array.from(actions);
  }
  
  hasStateChanged(previous: PageState, current: PageState): boolean {
    // Semantic comparison, not exact DOM matching
    if (previous.url !== current.url) return true;
    
    // Check if major sections changed
    const prevSections = new Set(previous.visibleSections);
    const currSections = new Set(current.visibleSections);
    
    if (prevSections.size !== currSections.size) return true;
    
    for (const section of currSections) {
      if (!prevSections.has(section)) return true;
    }
    
    return false;
  }
  
  addExtractedData(key: string, value: any): void {
    this.extractedData.set(key, value);
  }
  
  getStateHistory(): PageState[] {
    return [...this.stateHistory];
  }
}
```

### Phase 4: Integration and Migration

#### 4.0 Browser Initialization Integration

**File**: `src/core/services/workflow-manager.ts` (additions)

```typescript
export class WorkflowManager {
  // Add browser reference
  constructor(
    private planner: ITaskPlanner,
    private executor: ITaskExecutor,
    private evaluator: ITaskEvaluator,
    private errorHandler: IErrorHandler,
    private eventBus: EnhancedEventBusInterface,
    private browser: Browser, // ← MISSING FROM ORIGINAL PLAN
    private reporter: AgentReporter, // ← MISSING FROM ORIGINAL PLAN
    private config: WorkflowManagerConfig = {}
  ) {
    // ... existing initialization
  }

  async executeWorkflow(goal: string, startUrl?: string): Promise<WorkflowResult> {
    this.startTime = new Date();
    
    // CRITICAL: Initialize browser with start URL
    // This was completely missing from the original plan
    const initialUrl = startUrl || 'https://amazon.com';
    await this.browser.launch(initialUrl);
    this.reporter.log(`🌐 Browser launched at: ${initialUrl}`);
    
    // Emit workflow planning event
    this.emitWorkflowEvent('workflow:planning', { goal });
    
    // Get current URL after browser launch
    const currentUrl = this.browser.getPageUrl();
    
    // Create initial plan with actual current URL
    const plannerInput: PlannerInput = {
      goal,
      currentUrl, // Now has real URL instead of 'about:blank'
      constraints: []
    };
    
    // ... rest of execution logic
  }

  // Add proper cleanup
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.reporter.log('🛑 Browser closed');
    }
  }
}
```

**File**: `src/init-multi-agent.ts`

```typescript
export function initMultiAgent(config: MultiAgentConfig): WorkflowManager {
  // ... existing infrastructure setup
  
  // MISSING: Console reporter integration
  const reporter = new ConsoleReporter('MultiAgent');
  
  const workflowConfig = {
    // ... existing config
    browser, // ← MISSING: Pass browser to workflow manager
    reporter, // ← MISSING: Pass reporter for console output
    eventBus: enhancedEventBus
  };
  
  const workflowManager = AgentFactory.createWorkflowManager(workflowConfig);
  
  // MISSING: Setup event monitoring for console output
  const monitor = new WorkflowMonitor(enhancedEventBus, reporter);
  
  return workflowManager;
}
```

**File**: `src/core/services/workflow-monitor.ts` 

```typescript
export class WorkflowMonitor {
  constructor(
    private eventBus: EnhancedEventBusInterface,
    private reporter: AgentReporter
  ) {
    this.setupListeners();
  }
  
  private setupListeners() {
    this.eventBus.on('workflow:started', this.onWorkflowStart.bind(this));
    this.eventBus.on('task:started', this.onTaskStart.bind(this));
    this.eventBus.on('task:completed', this.onTaskComplete.bind(this));
    this.eventBus.on('task:failed', this.onTaskFailed.bind(this));
    this.eventBus.on('workflow:completed', this.onWorkflowComplete.bind(this));
  }
  
  private onWorkflowStart(event: WorkflowEvent) {
    this.reporter.log(`🚀 Workflow started: ${event.goal}`);
    this.reporter.log(`📋 Plan created with ${event.plan?.tasks.length || 0} tasks`);
  }
  
  private onTaskStart(event: TaskEvent) {
    this.reporter.log(`⚡ Executing: ${event.task.name}`);
  }
  
  private onTaskComplete(event: TaskEvent) {
    const status = event.result?.status === 'success' ? '✅' : '❌';
    this.reporter.log(`${status} ${event.task.name} (${event.result?.duration}ms)`);
  }
}
```

**Entry Point Files** 

**File**: `agent-amazon-multi.ts`

```typescript
import { initMultiAgent } from './src/init-multi-agent';
import { Variable } from './src/core/entities/variable';

async function main() {
  const workflow = initMultiAgent({
    apiKey: process.env.OPENAI_API_KEY!,
    headless: false,
    variables: [],
    models: {
      planner: 'gpt-5-mini',
      executor: 'gpt-5-mini',
      evaluator: 'gpt-5-mini',
      errorHandler: 'gpt-5-mini'
    },
    maxRetries: 3,
    timeout: 300000
  });

  try {
    console.log('🚀 Starting Amazon workflow...');
    
    // Execute workflow with specific Amazon start URL
    const result = await workflow.executeWorkflow(
      'Search for wireless headphones under $100',
      'https://amazon.com' // ← This was missing from original plan
    );
    
    console.log('📊 Results:', result);
  } catch (error) {
    console.error('💥 Error:', error);
  } finally {
    // Cleanup browser - missing from original plan
    await workflow.cleanup();
  }
}

if (require.main === module) {
  main().catch(console.error);
}
```

#### 4.1 Factory Pattern for Agent Creation
**File**: `src/core/factories/agent-factory.ts`

```typescript
export class AgentFactory {
  static createPlanner(config: PlannerConfig): ITaskPlanner {
    const llm = new ChatOpenAI({
      model: 'gpt-5-mini',
      temperature: 0.3,
      apiKey: config.apiKey
    });
    
    return new TaskPlannerAgent(llm, config);
  }
  
  static createExecutor(config: ExecutorConfig): ITaskExecutor {
    const llm = new ChatOpenAI({
      model: 'gpt-5-nano',
      temperature: 0.1,
      apiKey: config.apiKey
    });
    
    return new TaskExecutorAgent(
      llm,
      config.browser,
      config.domService
    );
  }
  
  static createEvaluator(config: EvaluatorConfig): ITaskEvaluator {
    const llm = new ChatOpenAI({
      model: 'gpt-5-nano',
      temperature: 0,
      apiKey: config.apiKey
    });
    
    return new TaskEvaluatorAgent(llm, config);
  }
  
  static createWorkflowManager(config: WorkflowConfig): WorkflowManager {
    const planner = this.createPlanner(config.planner);
    const executor = this.createExecutor(config.executor);
    const evaluator = this.createEvaluator(config.evaluator);
    const errorHandler = this.createErrorHandler(config.errorHandler);
    
    return new WorkflowManager(
      planner,
      executor,
      evaluator,
      errorHandler,
      config.eventBus
    );
  }
}
```

#### 4.2 New Entry Point
**File**: `src/init-multi-agent.ts`

```typescript
import { AgentFactory } from './core/factories/agent-factory';
import { WorkflowManager } from './core/services/workflow-manager';

export interface MultiAgentConfig {
  apiKey: string;
  headless: boolean;
  variables: Variable[];
  models?: {
    planner?: string;
    executor?: string;
    evaluator?: string;
  };
  maxRetries?: number;
  timeout?: number;
}

export function initMultiAgent(config: MultiAgentConfig): WorkflowManager {
  const browser = new ChromiumBrowser({ headless: config.headless });
  const fileSystem = new InMemoryFileSystem();
  const screenshotter = new PlaywrightScreenshoter(fileSystem);
  const eventBus = new EventBus();
  const domService = new DomService(screenshotter, browser, eventBus);
  
  const workflowConfig = {
    planner: {
      apiKey: config.apiKey,
      model: config.models?.planner || 'gpt-5-mini'
    },
    executor: {
      apiKey: config.apiKey,
      model: config.models?.executor || 'gpt-5-nano',
      browser,
      domService
    },
    evaluator: {
      apiKey: config.apiKey,
      model: config.models?.evaluator || 'gpt-5-nano'
    },
    errorHandler: {
      apiKey: config.apiKey,
      maxRetries: config.maxRetries || 3
    },
    eventBus
  };
  
  return AgentFactory.createWorkflowManager(workflowConfig);
}
```

#### 4.3 Updated Usage Example
**File**: `agent-github-multi.ts`

```typescript
import { initMultiAgent, Variable } from './src';

async function main() {
  const username = new Variable({
    name: 'username',
    value: 'user@example.com',
    isSecret: false
  });
  
  const password = new Variable({
    name: 'password',
    value: 'secret',
    isSecret: true
  });
  
  const workflow = initMultiAgent({
    apiKey: process.env.OPENAI_API_KEY!,
    headless: false,
    variables: [username, password],
    models: {
      planner: 'gpt-5-mini',
      executor: 'gpt-5-nano',
      evaluator: 'gpt-5-nano'
    },
    maxRetries: 3
  });
  
  const result = await workflow.executeWorkflow(
    'Login to GitHub and update my bio to "Building the future with AI"'
  );
  
  console.log('Workflow completed:', result);
}

main();
```

### Phase 5: Example Workflow - Amazon Search

This example demonstrates how the dynamic, state-aware architecture works in practice:

#### User Goal
"Search for wireless headphones under $100 and show me the top 3 results"

#### Step 1: Strategic Planning (Task Planner)
The planner creates a HIGH-LEVEL plan:
```json
{
  "strategy": [
    {
      "step": 1,
      "intent": "search",
      "description": "Search for wireless headphones",
      "targetConcept": "main search functionality",
      "inputData": "wireless headphones",
      "expectedResult": "Search results showing headphone products"
    },
    {
      "step": 2,
      "intent": "filter",
      "description": "Apply price filter up to $100",
      "targetConcept": "price filtering options",
      "inputData": { "maxPrice": 100 },
      "expectedResult": "Results filtered to items under $100"
    },
    {
      "step": 3,
      "intent": "extract",
      "description": "Extract top 3 results",
      "targetConcept": "product listings",
      "expectedResult": "Information about top 3 products"
    }
  ]
}
```

#### Step 2: Execution of "Search for wireless headphones" (Task Executor)
The executor receives the strategic step and current DOM, then decomposes it:

**Input**: Strategic step "Search for wireless headphones"
**Current DOM Analysis**: Executor sees actual page elements
**Decomposition into micro-actions**:
```json
[
  {
    "type": "click",
    "elementIndex": 42,
    "description": "Click search input field"
  },
  {
    "type": "fill",
    "elementIndex": 42,
    "value": "wireless headphones",
    "description": "Type search query"
  },
  {
    "type": "press_key",
    "key": "Enter",
    "description": "Submit search"
  }
]
```

#### Step 3: Evaluation (Task Evaluator)
Evaluator checks strategic success:
- **Before State**: Amazon homepage, search bar visible
- **After State**: Search results page, URL contains "wireless+headphones"
- **Evidence**: Multiple product listings visible, all related to headphones
- **Result**: SUCCESS - Search was executed successfully

#### Step 4: Continue with Price Filter
Executor receives "Apply price filter up to $100" and sees the NEW page state:
```json
[
  {
    "type": "scroll",
    "direction": "down",
    "description": "Scroll to find price filter"
  },
  {
    "type": "click",
    "elementIndex": 156,
    "description": "Click on price filter input"
  },
  {
    "type": "fill",
    "elementIndex": 158,
    "value": "100",
    "description": "Enter max price"
  },
  {
    "type": "click",
    "elementIndex": 159,
    "description": "Apply filter"
  }
]
```

#### Key Differences from Static Approach:
1. **Planner** never mentions DOM elements or selectors
2. **Executor** discovers actual elements at runtime
3. **Plan adapts** if page structure is different than expected
4. **Evaluation** is based on user-observable outcomes
5. **Only 3 strategic steps** instead of 20+ micro-tasks upfront

### Phase 6: Testing Strategy

#### 5.1 Unit Tests for Each Agent
**File**: `src/core/agents/__tests__/task-planner.test.ts`

```typescript
describe('TaskPlannerAgent', () => {
  let planner: TaskPlannerAgent;
  let mockLLM: jest.Mocked<LLM>;
  
  beforeEach(() => {
    mockLLM = createMockLLM();
    planner = new TaskPlannerAgent(mockLLM, defaultConfig);
  });
  
  test('should decompose login goal into atomic tasks', async () => {
    const input = {
      goal: 'Login to website',
      currentUrl: 'https://example.com',
      constraints: []
    };
    
    mockLLM.invoke.mockResolvedValue({
      tasks: [
        { id: '1', name: 'Click login button', type: 'click' },
        { id: '2', name: 'Fill username', type: 'fill' },
        { id: '3', name: 'Fill password', type: 'fill' },
        { id: '4', name: 'Submit form', type: 'click' }
      ]
    });
    
    const result = await planner.execute(input);
    
    expect(result.tasks).toHaveLength(4);
    expect(result.tasks[0].type).toBe('click');
  });
  
  test('should handle complex goals with dependencies', async () => {
  });
});
```

#### 5.2 Integration Tests
**File**: `src/core/__tests__/integration/workflow.test.ts`

```typescript
describe('WorkflowManager Integration', () => {
  test('should complete end-to-end login workflow', async () => {
    const workflow = createTestWorkflow();
    
    const result = await workflow.executeWorkflow(
      'Login with username test@example.com'
    );
    
    expect(result.status).toBe('success');
    expect(result.completedTasks).toContain('fill-username');
    expect(result.completedTasks).toContain('fill-password');
    expect(result.completedTasks).toContain('click-submit');
  });
});
```

### Phase 6: Migration Path

#### 6.1 Gradual Migration Strategy

1. **Week 1-2: Implement Core Interfaces**
   - Create all interfaces and base classes
   - Set up testing infrastructure
   - Implement TaskQueue and WorkflowManager

2. **Week 3-4: Build Specialized Agents**
   - Implement TaskPlannerAgent with tests
   - Implement TaskExecutorAgent with tests
   - Implement TaskEvaluatorAgent with tests

3. **Week 5: Integration**
   - Wire up agents with WorkflowManager
   - Create factory patterns
   - Run parallel testing with old system

4. **Week 6: Migration**
   - Update entry points to use new system
   - Maintain backward compatibility flag
   - Document migration guide

#### 6.2 Backward Compatibility
**File**: `src/index.ts`

```typescript
export { initAgentsPoc } from './init-agents-poc';
export { initMultiAgent } from './init-multi-agent';

export function initAgents(config: any) {
  if (config.useMultiAgent === true) {
    return initMultiAgent(config);
  }
  return initAgentsPoc(config);
}
```

## Configuration Files

### TypeScript Configuration
**File**: `tsconfig.json` (additions)

```json
{
  "compilerOptions": {
    "paths": {
      "@agents/*": ["src/core/agents/*"],
      "@services/*": ["src/core/services/*"],
      "@interfaces/*": ["src/core/interfaces/*"],
      "@factories/*": ["src/core/factories/*"]
    }
  }
}
```

### Package Dependencies
**File**: `package.json` (additions)

```json
{
  "dependencies": {
    "p-queue": "^7.3.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "jest-mock-extended": "^3.0.0"
  }
}
```

## Performance Optimizations

### 1. Model Selection Strategy
- **Planner**: GPT-5-mini (called once per workflow)
- **Executor**: GPT-5-nano (called multiple times)
- **Evaluator**: GPT-5-nano or custom classifier
- **Error Handler**: GPT-5-nano (called on failures)

### 2. Context Window Management
- Planner: Full context (up to 8k tokens)
- Executor: Minimal context (~500 tokens)
- Evaluator: Comparison context (~1k tokens)

### 3. Caching Strategy
- Cache DOM states between evaluations
- Cache successful task patterns
- Reuse screenshots when possible

## Monitoring and Observability

### Event System
**File**: `src/core/services/event-monitoring.ts`

```typescript
export class WorkflowMonitor {
  constructor(private eventBus: EventBus) {
    this.setupListeners();
  }
  
  private setupListeners() {
    this.eventBus.on('workflow:started', this.onWorkflowStart);
    this.eventBus.on('task:started', this.onTaskStart);
    this.eventBus.on('task:completed', this.onTaskComplete);
    this.eventBus.on('task:failed', this.onTaskFailed);
    this.eventBus.on('workflow:completed', this.onWorkflowComplete);
  }
  
  private onTaskStart = (event: TaskEvent) => {
    console.log(`[TASK START] ${event.task.name}`);
  };
  
  private onTaskComplete = (event: TaskEvent) => {
    console.log(`[TASK COMPLETE] ${event.task.name} in ${event.duration}ms`);
  };
}
```

## Success Metrics

### Key Performance Indicators for Dynamic Architecture
1. **Strategic Step Success Rate**: % of high-level steps completed (should be >90%)
2. **Micro-action Accuracy**: % of DOM interactions that succeed on first attempt
3. **Replanning Frequency**: How often plans need adjustment (lower is better)
4. **Context Efficiency**: Tokens per strategic step (not per micro-action)
5. **Adaptation Rate**: Time to recover from unexpected page states
6. **Semantic Understanding**: % of correct page section identifications
7. **Plan Conciseness**: Average number of strategic steps per goal (3-7 ideal)

### Comparison: Static vs Dynamic Approach
| Metric | Static (Original Plan) | Dynamic (Updated Plan) |
|--------|----------------------|----------------------|
| Average steps per goal | 15-20 micro-tasks | 3-7 strategic steps |
| DOM selector accuracy | ~60% (hallucinated) | ~95% (discovered at runtime) |
| Adaptability to page changes | Poor | Excellent |
| Context window usage | High (all details upfront) | Efficient (incremental) |
| Debugging complexity | High (20+ steps) | Low (3-7 steps) |

### Expected Improvements
- **70% reduction in planning tokens** through high-level planning
- **90% accuracy in element selection** through runtime discovery
- **50% faster error recovery** through semantic state understanding
- **Improved reliability** on varying website implementations
- **Human-readable plans** that match user mental models

## Rollback Plan

If issues arise during migration:

1. **Immediate**: Feature flag to disable new system
2. **Short-term**: Revert to previous version via Git
3. **Data**: No data migration required (stateless)
4. **Communication**: Notify users of temporary reversion

## Conclusion

This multi-agent architecture represents a significant improvement over the monolithic approach. By separating concerns and using appropriate models for each task complexity level, we achieve better reliability, lower costs, and improved maintainability.

The modular design allows for independent testing and deployment of each agent type, making the system more resilient and easier to debug. The implementation plan provides a clear path forward with minimal disruption to existing functionality.