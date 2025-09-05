# Visual-First Workflow Implementation Plan

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Target State Vision](#target-state-vision)
4. [Implementation Phases](#implementation-phases)
   - [Phase 1: Simplify Core Workflow Loop](#phase-1-simplify-core-workflow-loop)
   - [Phase 2: Implement Feedback Loop](#phase-2-implement-feedback-loop)
   - [Phase 3: Visual-First Execution](#phase-3-visual-first-execution)
   - [Phase 4: Intelligent Replanning](#phase-4-intelligent-replanning)
   - [Phase 5: Generic Output & API Ready](#phase-5-generic-output--api-ready)
5. [Migration Guide](#migration-guide)
6. [Junior Developer Guide](#junior-developer-guide)
7. [Testing Strategy](#testing-strategy)
8. [Risk Management](#risk-management)

---

## Executive Summary

### Project Goal
Transform the current complex Domain-Driven Design (DDD) multi-agent system into a streamlined, visual-first web automation framework that uses screenshots as the primary driver for decision-making and execution.

### Key Problem
The current implementation has become over-engineered with excessive abstraction layers (Aggregates, Repositories, Domain Events) that obscure the simple workflow: **See → Decide → Act → Verify → Continue/Retry**.

### Solution Approach
Implement a linear, visual-first workflow where:
- Screenshots with indexed elements drive ALL decisions
- Each step has a clear retry mechanism with evaluator feedback
- Replanning occurs after retry failures, not arbitrary state changes
- Output is generic and API-consumable

### Timeline
**5 Phases over 5 weeks**, each phase independently deployable and testable.

---

## Current State Analysis

### Architecture Overview
```
Current Complex Flow:
┌─────────────────┐
│ User Goal       │
└────────┬────────┘
         ▼
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│ WorkflowManager │────▶│ Workflow     │────▶│ Workflow    │
│ (1223 lines!)   │     │ Aggregate    │     │ Repository  │
└────────┬────────┘     └──────┬───────┘     └─────────────┘
         │                     │
         ▼                     ▼
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│ Planning        │────▶│ Plan Entity  │────▶│ Step Entity │
│ Service         │     │              │     │             │
└────────┬────────┘     └──────┬───────┘     └──────┬──────┘
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│ Execution       │────▶│ Task Entity  │────▶│ Domain      │
│ Service         │     │ (w/ retries) │     │ Events      │
└────────┬────────┘     └──────────────┘     └─────────────┘
         │
         ▼
┌─────────────────┐
│ Evaluation      │
│ Service         │
└─────────────────┘
```

### Current Problems

1. **Too Many Abstraction Layers**
   - File: `src/core/services/workflow-manager.ts` (1223 lines)
   - Creates: Workflow → Plan → WorkflowAggregate → ExecutionAggregate
   - Reality: Most of these add complexity without value

2. **Confused Execution Model**
   - Steps contain Tasks (why?)
   - Tasks have their own retry logic (should be at Step level)
   - MicroActions are generated but not properly utilized

3. **Screenshots Underutilized**
   - File: `src/infra/services/dom-service.ts`
   - Capability exists: `getDomState()` returns screenshots with indexes
   - BUT: Execution still primarily uses DOM selectors

4. **No Feedback Loop**
   - File: `src/core/agents/task-evaluator/task-evaluator.ts`
   - Returns: `{success: boolean, confidence: number}`
   - Missing: Actionable feedback like "clicked wrong element"

5. **Replanning Triggers Wrong**
   - File: `src/core/services/workflow-manager.ts` (line 668)
   - Current: Replans on state changes
   - Should be: After N retry failures

---

## Target State Vision

### Simplified Architecture
```
Target Simple Flow:
┌─────────────────┐
│ User Goal       │
└────────┬────────┘
         ▼
┌─────────────────────────────────────────┐
│ Planner                                  │
│ - Breaks goal into 3-7 visual steps     │
│ - Returns: Step[] with descriptions     │
└────────┬─────────────────────────────────┘
         ▼
┌─────────────────────────────────────────┐
│ Step Executor (for each step)           │
│ ┌─────────────────────────────────────┐ │
│ │ 1. Capture Screenshot w/ indexes    │ │
│ │ 2. Decide actions from visual       │ │
│ │ 3. Execute actions                  │ │
│ │ 4. Capture result screenshot        │ │
│ └──────────────┬──────────────────────┘ │
└────────────────┼────────────────────────┘
                 ▼
┌─────────────────────────────────────────┐
│ Evaluator                                │
│ - Compare before/after screenshots       │
│ - Determine if step succeeded           │
│ - Provide specific feedback if failed   │
└────────┬───────────────┬────────────────┘
         │ Success       │ Failed
         ▼               ▼
    Next Step      Retry (up to 3x)
                   with feedback
                         │
                         ▼ Still Failed
                   ┌──────────────┐
                   │ Replanner    │
                   │ - Gets context│
                   │ - Adjusts plan│
                   └──────────────┘
```

### Key Principles

1. **Visual-First**: Screenshots drive everything
2. **Simple Loop**: Execute → Evaluate → Retry/Continue
3. **Clear Feedback**: "You clicked element 5 but needed element 7"
4. **Smart Replanning**: After retries exhausted, not on every change
5. **Generic Output**: Structured, API-ready results

---

## Implementation Phases

## Phase 1: Simplify Core Workflow Loop
**Duration**: 5-7 days | **Risk**: Medium | **Priority**: Critical

### Objective
Strip away unnecessary DDD complexity and create a simple, linear workflow execution model.

### Current Problems to Fix
1. WorkflowManager is 1223 lines of tangled responsibilities
2. Three-level hierarchy (Step → Task → MicroAction) is confusing
3. Multiple aggregates and repositories add no value

### Implementation Steps

#### Step 1.1: Create New Simplified WorkflowExecutor
**File to Create**: `src/core/services/simple-workflow-executor.ts`

```typescript
// Simplified structure - NO aggregates, NO repositories
export interface VisualStep {
  id: string;
  description: string;  // "Search for coffee beans"
  order: number;        // 1, 2, 3...
  retryCount: number;   // Current retry attempt
  maxRetries: number;   // Default 3
  status: 'pending' | 'executing' | 'completed' | 'failed';
}

export interface StepExecutionContext {
  screenshot: string;           // Base64 screenshot with indexes
  domElements: DomNode[];       // Indexed elements from screenshot
  previousAttempts: AttemptHistory[];
  evaluatorFeedback?: string;   // From previous attempt
}

export class SimpleWorkflowExecutor {
  constructor(
    private planner: TaskPlannerAgent,
    private executor: TaskExecutorAgent,
    private evaluator: TaskEvaluatorAgent,
    private browser: Browser,
    private domService: DomService
  ) {}

  async executeGoal(goal: string, startUrl: string): Promise<WorkflowResult> {
    // 1. Plan
    const steps = await this.planSteps(goal, startUrl);
    
    // 2. Execute each step
    for (const step of steps) {
      const result = await this.executeStep(step);
      
      if (!result.success && !result.canContinue) {
        // Trigger replanning
        const remainingSteps = await this.replan(steps, step, result);
        steps.splice(step.order, steps.length, ...remainingSteps);
      }
    }
    
    // 3. Summarize
    return this.createSummary(steps);
  }
}
```

#### Step 1.2: Replace Entity Hierarchy
**Files to Modify**:
- Remove: `src/core/entities/task.ts` (Task entity not needed)
- Simplify: `src/core/entities/step.ts` to match VisualStep interface
- Remove: `src/core/aggregates/workflow-aggregate.ts` (unnecessary abstraction)

**Before** (Complex):
```typescript
// workflow-aggregate.ts
class WorkflowAggregate {
  constructor(
    private workflow: Workflow,
    private plan: Plan,
    private session: Session
  ) {}
  // 500+ lines of complex orchestration
}
```

**After** (Simple):
```typescript
// Just use a simple workflow state object
interface WorkflowState {
  goal: string;
  url: string;
  steps: VisualStep[];
  currentStepIndex: number;
  extractedData: Record<string, any>;
}
```

#### Step 1.3: Refactor Agent Interfaces
**Files to Modify**:
- `src/core/agents/task-planner/task-planner.ts`
- `src/core/agents/task-executor/task-executor.ts`
- `src/core/agents/task-evaluator/task-evaluator.ts`

**Change Planning Output**:
```typescript
// Before: Complex StrategicTask with dependencies
interface PlannerOutput {
  strategy: StrategicTask[];  // Complex object with 10+ fields
}

// After: Simple step descriptions
interface SimplePlannerOutput {
  steps: Array<{
    description: string;  // "Search for coffee beans"
    order: number;
  }>;
}
```

### Testing Checklist
- [ ] Can execute simple Amazon search without aggregates
- [ ] Steps execute in order
- [ ] Workflow completes successfully
- [ ] No domain events needed

### Migration Notes
- Keep old WorkflowManager temporarily as `workflow-manager.legacy.ts`
- New entry point: `agent-amazon-simple.ts` for testing

---

## Phase 2: Implement Feedback Loop
**Duration**: 5-7 days | **Risk**: Low | **Priority**: Critical

### Objective
Create a proper retry mechanism where the Evaluator provides specific, actionable feedback to the Executor for improving failed attempts.

### Current Problems to Fix
1. Evaluator only returns success/failure
2. No mechanism to pass feedback to executor
3. Retries happen without learning from failures

### Implementation Steps

#### Step 2.1: Enhance Evaluator Feedback
**File to Modify**: `src/core/agents/task-evaluator/task-evaluator.ts`

**Current Structure**:
```typescript
interface EvaluatorOutput {
  success: boolean;
  confidence: number;
  reasoning: string;
}
```

**New Structure**:
```typescript
interface EnhancedEvaluatorOutput {
  success: boolean;
  confidence: number;
  reasoning: string;
  
  // NEW: Specific feedback for retry
  feedback?: {
    type: 'wrong_element' | 'timing' | 'page_state' | 'not_visible' | 'other';
    details: string;  // "Clicked element 5 (button) but should click element 7 (search input)"
    suggestion: string;  // "Try clicking the search input with index 7 instead"
    
    // Visual feedback
    expectedElement?: {
      index: number;
      description: string;
    };
    actualElement?: {
      index: number;
      description: string;
    };
  };
  
  // Evidence of what happened
  evidence: {
    beforeScreenshot: string;
    afterScreenshot: string;
    changedElements: number[];  // Indexes that changed
  };
}
```

#### Step 2.2: Modify Evaluator Prompt
**File to Modify**: `src/core/agents/task-evaluator/task-evaluator.prompt.ts`

**Add to Prompt**:
```typescript
const ENHANCED_EVALUATOR_PROMPT = `
${EXISTING_PROMPT}

When a step fails, provide SPECIFIC feedback:
1. What element was incorrectly interacted with (include index)
2. What element should have been used instead (include index)
3. Why the current approach failed
4. Specific suggestion for the retry

Examples of good feedback:
- "Clicked element 12 which is a nav button, but should click element 7 which is the search input"
- "Typed in element 3 but it's read-only, try element 8 which is editable"
- "Waited for element 15 but it never appeared, try scrolling down first"
`;
```

#### Step 2.3: Implement Retry Logic in Executor
**File to Modify**: `src/core/services/simple-workflow-executor.ts`

```typescript
async executeStep(step: VisualStep): Promise<StepResult> {
  let attempts = 0;
  let lastFeedback: EvaluatorFeedback | undefined;
  
  while (attempts < step.maxRetries) {
    attempts++;
    
    // 1. Capture current state
    const context = await this.captureContext(lastFeedback);
    
    // 2. Execute with feedback context
    const execution = await this.executor.execute({
      step: step,
      context: context,
      previousFeedback: lastFeedback,  // Pass feedback to executor
      attemptNumber: attempts
    });
    
    // 3. Evaluate
    const evaluation = await this.evaluator.evaluate({
      step: step,
      beforeState: context.screenshot,
      afterState: execution.screenshot,
      actions: execution.actions
    });
    
    if (evaluation.success) {
      return { success: true, data: execution.extractedData };
    }
    
    // 4. Store feedback for next attempt
    lastFeedback = evaluation.feedback;
    
    console.log(`❌ Attempt ${attempts} failed: ${lastFeedback?.details}`);
    console.log(`💡 Suggestion: ${lastFeedback?.suggestion}`);
  }
  
  // All retries exhausted
  return {
    success: false,
    lastFeedback: lastFeedback,
    attempts: attempts,
    canContinue: false  // Trigger replanning
  };
}
```

#### Step 2.4: Modify Executor to Use Feedback
**File to Modify**: `src/core/agents/task-executor/task-executor.ts`

```typescript
async execute(input: ExecutorInput): Promise<ExecutorOutput> {
  // Check if we have feedback from previous attempt
  if (input.previousFeedback) {
    console.log(`📝 Using feedback: ${input.previousFeedback.suggestion}`);
    
    // Adjust strategy based on feedback type
    switch (input.previousFeedback.type) {
      case 'wrong_element':
        // Use suggested element index
        const suggestedIndex = input.previousFeedback.expectedElement?.index;
        // Prioritize this element in action generation
        break;
        
      case 'timing':
        // Add wait or scroll actions
        break;
        
      case 'page_state':
        // May need different approach entirely
        break;
    }
  }
  
  // Continue with execution...
}
```

### Testing Checklist
- [ ] Evaluator provides specific feedback on failure
- [ ] Executor uses feedback to improve retry
- [ ] Retry attempts show different approaches
- [ ] Success rate improves with retries

### Example Test Case
```typescript
// Test: Wrong element clicked
// Step: "Search for coffee"
// Attempt 1: Clicks nav menu (element 5)
// Feedback: "Clicked nav menu (5), should click search input (7)"
// Attempt 2: Clicks search input (element 7) - SUCCESS
```

---

## Phase 3: Visual-First Execution
**Duration**: 7-10 days | **Risk**: Medium | **Priority**: High

### Objective
Make screenshots with indexed elements the PRIMARY driver for all decisions, reducing dependency on DOM selectors and HTML parsing.

### Current Problems to Fix
1. Execution relies heavily on DOM selectors despite having screenshots
2. Screenshot indexes exist but aren't used effectively
3. Visual context ignored in favor of HTML structure

### Implementation Steps

#### Step 3.1: Enhance Screenshot Processing
**File to Modify**: `src/infra/services/dom-service.ts`

**Current Capability** (Already exists):
```typescript
async getDomState(): Promise<SerializedDomState> {
  return {
    screenshot: string;        // Screenshot with numbered boxes
    pristineScreenshot: string; // Original without boxes
    domState: DomNode;        // Indexed elements
    pixelAbove: number;
    pixelBelow: number;
  };
}
```

**Enhancement Needed**:
```typescript
interface VisualElement {
  index: number;           // Visual index shown on screenshot
  bounds: { x: number, y: number, width: number, height: number };
  type: 'button' | 'input' | 'link' | 'text' | 'image' | 'other';
  visualLabel: string;     // Text visible on element
  isInteractive: boolean;
  color: string;          // Color of index box
  confidence: number;     // How confident we are this is clickable
}

export interface EnhancedVisualState {
  screenshot: string;
  elements: VisualElement[];
  pageContext: {
    url: string;
    title: string;
    totalElements: number;
    viewportVisible: number[];  // Which elements are visible
  };
}
```

#### Step 3.2: Create Visual-First Executor Strategy
**File to Create**: `src/core/strategies/visual-executor-strategy.ts`

```typescript
export class VisualExecutorStrategy {
  /**
   * Generate actions based ONLY on what's visible in screenshot
   */
  async generateActionsFromVisual(
    step: VisualStep,
    visualState: EnhancedVisualState,
    feedback?: EvaluatorFeedback
  ): Promise<VisualAction[]> {
    
    // Build context for LLM
    const visualContext = this.buildVisualContext(visualState);
    
    // Create prompt that focuses on visual elements
    const prompt = `
    You are looking at a screenshot of a webpage with numbered elements.
    
    Current Goal: ${step.description}
    
    Visible Elements:
    ${visualState.elements.map(e => 
      `[${e.index}] ${e.type} "${e.visualLabel}" at position ${e.bounds.x},${e.bounds.y}`
    ).join('\n')}
    
    ${feedback ? `Previous Attempt Feedback: ${feedback.suggestion}` : ''}
    
    Based ONLY on what you can see, what element(s) should be interacted with?
    Return the index number(s) and action type.
    `;
    
    // Get LLM decision
    const decision = await this.llm.decide(prompt, visualState.screenshot);
    
    return this.convertToActions(decision, visualState);
  }
}
```

#### Step 3.3: Modify Executor to be Visual-First
**File to Modify**: `src/core/agents/task-executor/task-executor.ts`

**Before** (DOM-focused):
```typescript
async execute(input: ExecutorInput): Promise<ExecutorOutput> {
  // Gets DOM state
  const domState = await this.domService.getInteractiveElements();
  
  // Uses HTML structure
  const microActions = await this.decomposeStrategicStep(
    strategicTask, 
    stringifiedDomState  // Text representation
  );
}
```

**After** (Visual-first):
```typescript
async execute(input: ExecutorInput): Promise<ExecutorOutput> {
  // Get visual state
  const visualState = await this.domService.getEnhancedVisualState();
  
  // Use visual strategy
  const actions = await this.visualStrategy.generateActionsFromVisual(
    input.step,
    visualState,
    input.previousFeedback
  );
  
  // Execute actions using visual indexes
  for (const action of actions) {
    await this.executeVisualAction(action, visualState);
  }
}

private async executeVisualAction(
  action: VisualAction,
  visualState: EnhancedVisualState
): Promise<void> {
  const element = visualState.elements.find(e => e.index === action.elementIndex);
  
  if (!element) {
    throw new Error(`Element ${action.elementIndex} not found in visual state`);
  }
  
  // Click using coordinates from visual bounds
  switch (action.type) {
    case 'click':
      await this.browser.click(element.bounds.x, element.bounds.y);
      break;
    case 'type':
      await this.browser.click(element.bounds.x, element.bounds.y);
      await this.browser.type(action.text);
      break;
  }
}
```

#### Step 3.4: Update Planner for Visual Steps
**File to Modify**: `src/core/agents/task-planner/task-planner.prompt.ts`

```typescript
export const VISUAL_PLANNER_PROMPT = `
You are a visual automation planner. Create steps that describe what a HUMAN would SEE and DO.

Good Step Descriptions:
✅ "Click the search box at the top of the page"
✅ "Type 'coffee beans' in the search field"
✅ "Click the blue 'Search' button"
✅ "Select the first product with 4+ stars"

Bad Step Descriptions:
❌ "Find element with selector #search-input"
❌ "Execute JavaScript to submit form"
❌ "Locate div.product-card:first-child"

Remember: You're describing what to LOOK for visually, not technical implementation.
`;
```

### Testing Checklist
- [ ] Executor uses screenshot indexes, not DOM selectors
- [ ] Actions based on visual position, not HTML structure
- [ ] Can complete task using only visual information
- [ ] Works even if HTML structure changes

### Visual Test Example
```typescript
// Test: Amazon search using pure visual
// 1. Screenshot shows search box as element [7]
// 2. Executor identifies [7] as search input from visual
// 3. Clicks coordinates of [7]
// 4. Types search term
// 5. Identifies search button visually as [9]
// 6. Clicks [9]
// Success - no DOM selectors used!
```

---

## Phase 4: Intelligent Replanning
**Duration**: 5-7 days | **Risk**: Medium | **Priority**: High

### Objective
Implement smart replanning that triggers after retry failures (not arbitrary state changes) and uses evaluator context to adjust the remaining plan.

### Current Problems to Fix
1. Replanning triggers on state changes (too frequent)
2. No context passed from failed attempts to replanner
3. Replans entire workflow instead of remaining steps

### Implementation Steps

#### Step 4.1: Create Replan Trigger Mechanism
**File to Modify**: `src/core/services/simple-workflow-executor.ts`

```typescript
interface ReplanTrigger {
  step: VisualStep;
  failureReason: string;
  attempts: AttemptHistory[];
  evaluatorContext: EvaluatorFeedback[];
  currentState: EnhancedVisualState;
}

class SimpleWorkflowExecutor {
  async executeStep(step: VisualStep): Promise<StepResult> {
    const result = await this.executeWithRetries(step);
    
    // Only trigger replan after retries exhausted
    if (!result.success && result.attempts >= step.maxRetries) {
      const replanTrigger: ReplanTrigger = {
        step: step,
        failureReason: result.lastFeedback?.details || 'Unknown failure',
        attempts: result.attemptHistory,
        evaluatorContext: result.allFeedback,
        currentState: await this.captureVisualState()
      };
      
      return { 
        success: false, 
        triggerReplan: true,
        replanContext: replanTrigger
      };
    }
    
    return result;
  }
}
```

#### Step 4.2: Implement Context-Aware Replanner
**File to Create**: `src/core/agents/task-replanner/task-replanner.ts`

```typescript
export class TaskReplanner {
  async replan(
    originalPlan: VisualStep[],
    failedStep: VisualStep,
    context: ReplanTrigger
  ): Promise<VisualStep[]> {
    
    // Determine what was completed
    const completedSteps = originalPlan.filter(s => s.status === 'completed');
    const remainingSteps = originalPlan.filter(s => s.status === 'pending');
    
    // Build context for replanner
    const replanPrompt = this.buildReplanPrompt({
      originalGoal: this.extractGoalFromPlan(originalPlan),
      completedSteps: completedSteps,
      failedStep: failedStep,
      failureDetails: context.failureReason,
      evaluatorFeedback: context.evaluatorContext,
      currentPageState: context.currentState,
      remainingObjective: this.determineRemainingObjective(remainingSteps)
    });
    
    // Get new plan from LLM
    const newPlan = await this.llm.replan(replanPrompt);
    
    // Validate new plan makes sense
    return this.validateAndAdjustPlan(newPlan, context);
  }
  
  private buildReplanPrompt(context: ReplanContext): string {
    return `
    REPLANNING NEEDED
    
    Original Goal: ${context.originalGoal}
    
    Completed Successfully:
    ${context.completedSteps.map(s => `✓ ${s.description}`).join('\n')}
    
    FAILED Step: ${context.failedStep.description}
    Reason: ${context.failureDetails}
    
    Evaluator Feedback from Attempts:
    ${context.evaluatorFeedback.map(f => 
      `- Attempt: ${f.details}\n  Suggestion: ${f.suggestion}`
    ).join('\n')}
    
    Current Page State:
    URL: ${context.currentPageState.pageContext.url}
    Visible Elements: ${context.currentPageState.elements.length}
    
    Remaining Objective: ${context.remainingObjective}
    
    Please create a NEW plan to achieve the remaining objective,
    taking into account what failed and why.
    
    Options:
    1. Adjust the approach for the failed step
    2. Add preparatory steps before retrying
    3. Skip the failed step if non-critical
    4. Take alternative path to achieve goal
    `;
  }
}
```

#### Step 4.3: Integrate Replanner into Workflow
**File to Modify**: `src/core/services/simple-workflow-executor.ts`

```typescript
async executeGoal(goal: string, startUrl: string): Promise<WorkflowResult> {
  let steps = await this.planner.planSteps(goal, startUrl);
  let stepIndex = 0;
  
  while (stepIndex < steps.length) {
    const step = steps[stepIndex];
    const result = await this.executeStep(step);
    
    if (result.triggerReplan) {
      console.log(`🔄 Replanning needed after step ${stepIndex + 1} failed`);
      
      // Get new plan for remaining work
      const newSteps = await this.replanner.replan(
        steps,
        step,
        result.replanContext
      );
      
      // Replace remaining steps with new plan
      steps = [
        ...steps.slice(0, stepIndex),  // Keep completed
        ...newSteps                     // New plan for remaining
      ];
      
      console.log(`📋 New plan created with ${newSteps.length} steps`);
      
      // Continue from current position (retry with new approach)
      continue;
    }
    
    stepIndex++;
  }
  
  return this.createSummary(steps);
}
```

#### Step 4.4: Add Replan Strategies
**File to Create**: `src/core/strategies/replan-strategies.ts`

```typescript
export enum ReplanStrategy {
  RETRY_DIFFERENT_APPROACH = 'retry_different',    // Try different way
  ADD_PREPARATION_STEPS = 'add_prep',              // Add steps before retry
  SKIP_AND_CONTINUE = 'skip',                      // Skip if non-critical
  ALTERNATIVE_PATH = 'alternative',                // Completely different route
  ABORT_WORKFLOW = 'abort'                         // Can't proceed
}

export class ReplanStrategySelector {
  selectStrategy(context: ReplanTrigger): ReplanStrategy {
    // If login failed, might need different approach
    if (context.step.description.includes('login')) {
      return ReplanStrategy.RETRY_DIFFERENT_APPROACH;
    }
    
    // If element not found, might need navigation first
    if (context.failureReason.includes('not found')) {
      return ReplanStrategy.ADD_PREPARATION_STEPS;
    }
    
    // If search failed, try alternative
    if (context.step.description.includes('search')) {
      return ReplanStrategy.ALTERNATIVE_PATH;
    }
    
    // Default: try different approach
    return ReplanStrategy.RETRY_DIFFERENT_APPROACH;
  }
}
```

### Testing Checklist
- [ ] Replan only triggers after max retries reached
- [ ] Context from failures passed to replanner
- [ ] New plan addresses specific failure reason
- [ ] Completed steps are preserved
- [ ] Can continue workflow with adjusted plan

### Replan Test Scenarios
```typescript
// Scenario 1: Search box not found
// Original: "Click search box" → Fails 3 times
// Replan: Adds "Click menu icon" → "Click search option" → "Click search box"

// Scenario 2: Login required unexpectedly
// Original: "Add to cart" → Fails (requires login)
// Replan: "Click sign in" → "Enter credentials" → "Submit" → "Add to cart"

// Scenario 3: Alternative path
// Original: "Use filters" → Fails (filters broken)
// Replan: "Use search with specific terms" → "Sort results" → Continue
```

---

## Phase 5: Generic Output & API Ready
**Duration**: 5-7 days | **Risk**: Low | **Priority**: Medium

### Objective
Create a standardized output format that's consistent across different websites and workflows, making it consumable by APIs and other systems.

### Current Problems to Fix
1. Output format varies based on workflow type
2. No structured summary for API consumption
3. Extracted data not standardized
4. No versioning or schema validation

### Implementation Steps

#### Step 5.1: Define Standard Output Schema
**File to Create**: `src/core/schemas/workflow-output-schema.ts`

```typescript
/**
 * Generic workflow output that works for any website/workflow
 */
export interface StandardWorkflowOutput {
  // Metadata
  metadata: {
    workflowId: string;
    version: '1.0.0';
    timestamp: string;  // ISO 8601
    duration: number;   // milliseconds
    goal: string;       // Original user goal
    startUrl: string;
    finalUrl: string;
  };
  
  // Execution Summary
  execution: {
    status: 'success' | 'partial' | 'failed';
    stepsPlanned: number;
    stepsCompleted: number;
    stepsSkipped: number;
    stepsFailed: number;
    totalRetries: number;
    replansTriggered: number;
  };
  
  // Step Details
  steps: Array<{
    order: number;
    description: string;
    status: 'completed' | 'failed' | 'skipped';
    attempts: number;
    duration: number;
    
    // What happened
    actions: Array<{
      type: 'click' | 'type' | 'navigate' | 'wait' | 'scroll';
      target?: string;  // Visual description
      value?: string;   // For type actions
    }>;
    
    // Evidence
    evidence?: {
      beforeScreenshot?: string;  // Base64 or URL
      afterScreenshot?: string;
      changedElements?: number[];
    };
  }>;
  
  // Extracted Data (flexible schema)
  extractedData: {
    structured: Record<string, any>;  // Key-value pairs
    
    // Common patterns
    items?: Array<{
      id?: string;
      title?: string;
      price?: number;
      url?: string;
      imageUrl?: string;
      rating?: number;
      customFields?: Record<string, any>;
    }>;
    
    // Raw text if needed
    rawText?: string[];
    
    // Screenshots of important moments
    keyScreenshots?: Array<{
      label: string;
      url: string;
      timestamp: string;
    }>;
  };
  
  // Human-readable summary
  summary: {
    brief: string;      // One-line summary
    detailed: string;   // Paragraph summary
    highlights: string[]; // Key achievements
    warnings?: string[];  // Issues encountered
  };
  
  // API Integration
  api: {
    nextActions?: string[];  // Suggested follow-up actions
    requiresAuth?: boolean;
    dataQuality: 'high' | 'medium' | 'low';
    confidence: number;  // 0-100
  };
  
  // Errors and Debugging
  errors?: Array<{
    step: number;
    type: string;
    message: string;
    recoverable: boolean;
    timestamp: string;
  }>;
}
```

#### Step 5.2: Implement Output Transformer
**File to Create**: `src/core/transformers/output-transformer.ts`

```typescript
export class WorkflowOutputTransformer {
  /**
   * Transform internal workflow state to standard output
   */
  transform(
    workflow: WorkflowState,
    steps: VisualStep[],
    extractedData: any
  ): StandardWorkflowOutput {
    
    const output: StandardWorkflowOutput = {
      metadata: this.buildMetadata(workflow),
      execution: this.buildExecutionSummary(steps),
      steps: this.transformSteps(steps),
      extractedData: this.normalizeExtractedData(extractedData),
      summary: this.generateSummary(workflow, steps, extractedData),
      api: this.buildApiInfo(workflow, extractedData),
      errors: this.collectErrors(steps)
    };
    
    // Validate output against schema
    this.validateOutput(output);
    
    return output;
  }
  
  /**
   * Normalize extracted data from various sources
   */
  private normalizeExtractedData(rawData: any): any {
    const normalized = {
      structured: {},
      items: [],
      rawText: [],
      keyScreenshots: []
    };
    
    // Handle different data shapes
    if (Array.isArray(rawData)) {
      normalized.items = this.normalizeItems(rawData);
    } else if (typeof rawData === 'object') {
      normalized.structured = this.flattenObject(rawData);
    }
    
    return normalized;
  }
  
  /**
   * Generate human-readable summary using AI
   */
  private async generateSummary(
    workflow: WorkflowState,
    steps: VisualStep[],
    data: any
  ): Promise<SummarySection> {
    
    const summaryPrompt = `
    Summarize this workflow execution:
    
    Goal: ${workflow.goal}
    Completed: ${steps.filter(s => s.status === 'completed').length}/${steps.length} steps
    
    Key Data Extracted:
    ${JSON.stringify(data, null, 2).substring(0, 500)}
    
    Provide:
    1. One-line brief summary
    2. Detailed paragraph
    3. 3-5 highlights
    4. Any warnings
    `;
    
    const summary = await this.llm.generateSummary(summaryPrompt);
    
    return {
      brief: summary.brief || `Completed ${workflow.goal}`,
      detailed: summary.detailed || 'Workflow executed successfully.',
      highlights: summary.highlights || [],
      warnings: summary.warnings
    };
  }
}
```

#### Step 5.3: Create Output Adapters for Different Consumers
**File to Create**: `src/core/adapters/output-adapters.ts`

```typescript
/**
 * Adapt standard output to different formats
 */
export class OutputAdapters {
  
  /**
   * Convert to REST API response
   */
  toApiResponse(output: StandardWorkflowOutput): any {
    return {
      success: output.execution.status === 'success',
      data: output.extractedData.structured,
      items: output.extractedData.items,
      summary: output.summary.brief,
      metadata: {
        duration: output.metadata.duration,
        confidence: output.api.confidence
      }
    };
  }
  
  /**
   * Convert to CSV for data export
   */
  toCsv(output: StandardWorkflowOutput): string {
    if (!output.extractedData.items?.length) {
      throw new Error('No items to export');
    }
    
    const headers = Object.keys(output.extractedData.items[0]);
    const rows = output.extractedData.items.map(item =>
      headers.map(h => item[h]).join(',')
    );
    
    return [headers.join(','), ...rows].join('\n');
  }
  
  /**
   * Convert to webhook payload
   */
  toWebhookPayload(output: StandardWorkflowOutput): any {
    return {
      event: 'workflow.completed',
      timestamp: output.metadata.timestamp,
      workflow_id: output.metadata.workflowId,
      status: output.execution.status,
      extracted_count: output.extractedData.items?.length || 0,
      data: output.extractedData.structured,
      next_actions: output.api.nextActions
    };
  }
  
  /**
   * Convert to database records
   */
  toDatabaseRecords(output: StandardWorkflowOutput): any[] {
    return output.extractedData.items?.map(item => ({
      workflow_id: output.metadata.workflowId,
      extracted_at: output.metadata.timestamp,
      data: item,
      confidence: output.api.confidence
    })) || [];
  }
}
```

#### Step 5.4: Integrate into Main Workflow
**File to Modify**: `src/core/services/simple-workflow-executor.ts`

```typescript
class SimpleWorkflowExecutor {
  async executeGoal(goal: string, startUrl: string): Promise<StandardWorkflowOutput> {
    const startTime = Date.now();
    const workflowId = generateId();
    
    // Track everything for output
    const workflowState: WorkflowState = {
      id: workflowId,
      goal,
      startUrl,
      steps: [],
      extractedData: {},
      errors: []
    };
    
    try {
      // Execute workflow
      workflowState.steps = await this.planSteps(goal, startUrl);
      
      for (const step of workflowState.steps) {
        const result = await this.executeStep(step);
        
        // Collect extracted data
        if (result.data) {
          Object.assign(workflowState.extractedData, result.data);
        }
        
        // Handle replanning if needed
        if (result.triggerReplan) {
          const newSteps = await this.replan(workflowState, step, result);
          workflowState.steps.push(...newSteps);
        }
      }
      
    } catch (error) {
      workflowState.errors.push({
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    // Transform to standard output
    const output = await this.outputTransformer.transform(
      workflowState,
      workflowState.steps,
      workflowState.extractedData
    );
    
    // Add final metadata
    output.metadata.duration = Date.now() - startTime;
    output.metadata.finalUrl = await this.browser.getUrl();
    
    return output;
  }
}
```

### Testing Checklist
- [ ] Output format consistent across different websites
- [ ] Schema validation passes
- [ ] Can convert to API response format
- [ ] Can export to CSV
- [ ] Extracted data properly structured
- [ ] Summary generation works

### Output Examples

**Amazon Search Output**:
```json
{
  "metadata": {
    "workflowId": "wf_123",
    "goal": "Search for coffee beans under $20",
    "duration": 45000
  },
  "execution": {
    "status": "success",
    "stepsCompleted": 5
  },
  "extractedData": {
    "items": [
      {
        "title": "Dark Roast Coffee Beans",
        "price": 18.99,
        "rating": 4.5,
        "url": "https://amazon.com/..."
      }
    ]
  },
  "summary": {
    "brief": "Found 15 coffee products under $20",
    "highlights": ["Best rated: 4.5 stars", "Price range: $12-19"]
  }
}
```

---

## Migration Guide

### Phase-by-Phase Migration Strategy

#### Pre-Migration Checklist
- [ ] Full backup of current codebase
- [ ] Document current workflow behaviors
- [ ] Identify critical test cases
- [ ] Set up feature flags for gradual rollout

#### Migration Steps

1. **Parallel Implementation** (Week 1-2)
   - Keep existing `WorkflowManager` as `workflow-manager.legacy.ts`
   - Implement `SimpleWorkflowExecutor` alongside
   - Create new entry points (e.g., `agent-amazon-simple.ts`)
   - Run both systems in parallel for comparison

2. **Gradual Cutover** (Week 3-4)
   ```typescript
   // Feature flag approach
   export function initWorkflow(config: WorkflowConfig) {
     if (config.useSimpleWorkflow) {
       return new SimpleWorkflowExecutor(config);
     } else {
       return new LegacyWorkflowManager(config);
     }
   }
   ```

3. **Testing and Validation** (Week 5)
   - Run A/B tests with both systems
   - Compare output quality
   - Measure performance improvements
   - Validate all critical workflows

4. **Full Migration** (Week 6)
   - Switch default to new system
   - Keep legacy as fallback
   - Monitor for issues
   - Document breaking changes

### Rollback Plan

If issues arise:
1. **Immediate**: Switch feature flag back to legacy
2. **Short-term**: Fix issues in new system while using legacy
3. **Long-term**: Consider hybrid approach if needed

### Breaking Changes

| Component | Old Way | New Way |
|-----------|---------|---------|
| Entry Point | `initMultiAgent()` | `new SimpleWorkflowExecutor()` |
| Output Format | Various | `StandardWorkflowOutput` |
| Retry Logic | Task-level | Step-level with feedback |
| Replanning | State-based | Failure-based |

---

## Junior Developer Guide

### Understanding the Core Concept

#### What We're Building
Imagine you're teaching someone to use a website by looking at screenshots:
1. **See**: Look at the screen
2. **Decide**: What to click/type
3. **Act**: Perform the action
4. **Check**: Did it work?
5. **Retry or Continue**: Learn from mistakes

#### Key Components Explained

##### 1. The Planner (Brain)
```typescript
// Think of it like writing instructions for a friend
const steps = [
  "Go to Amazon.com",
  "Click the search box",
  "Type 'coffee beans'",
  "Click the search button",
  "Click the first result"
];
```

##### 2. The Executor (Hands)
```typescript
// Takes a screenshot, finds elements, performs actions
async function executeStep(step: string) {
  const screenshot = await takeScreenshot();
  const elements = findNumberedElements(screenshot);
  const action = decideWhatToDo(step, elements);
  await performAction(action);
}
```

##### 3. The Evaluator (Eyes)
```typescript
// Checks if the action worked
function evaluate(before: Screenshot, after: Screenshot): boolean {
  const changes = compareScreenshots(before, after);
  return changes.matchExpectedResult();
}
```

##### 4. The Feedback Loop (Learning)
```typescript
// If it didn't work, try again with feedback
if (!success) {
  const feedback = "You clicked the wrong button, try element 7";
  const betterAction = improveWithFeedback(feedback);
  retry(betterAction);
}
```

### Common Patterns

#### Pattern 1: Screenshot-Driven Decision
```typescript
// BAD: Using DOM selectors
const element = document.querySelector('#search-input');

// GOOD: Using visual elements
const element = screenshot.elements.find(e => 
  e.visualLabel.includes('Search')
);
```

#### Pattern 2: Retry with Learning
```typescript
// BAD: Blind retry
for (let i = 0; i < 3; i++) {
  try {
    await execute();
    break;
  } catch (e) {
    // Same approach each time
  }
}

// GOOD: Learning retry
for (let i = 0; i < 3; i++) {
  const result = await execute(previousFeedback);
  if (result.success) break;
  previousFeedback = result.feedback;
  // Each attempt improves
}
```

### Debugging Tips

1. **Enable Visual Debug Mode**
   ```typescript
   // Save screenshots for each step
   config.debug = true;
   config.saveScreenshots = './debug/screenshots';
   ```

2. **Log Decision Process**
   ```typescript
   console.log(`Step: ${step.description}`);
   console.log(`Elements found: ${elements.length}`);
   console.log(`Decided to click: ${element.index}`);
   ```

3. **Test Individual Components**
   ```typescript
   // Test planner separately
   const steps = await planner.plan("Search Amazon");
   assert(steps.length > 0);
   
   // Test executor separately
   const result = await executor.execute(steps[0]);
   assert(result.success);
   ```

### Common Pitfalls and Solutions

| Problem | Why It Happens | Solution |
|---------|---------------|----------|
| Wrong element clicked | Similar looking elements | Use more context (position, color) |
| Retry doesn't improve | No feedback used | Pass evaluator feedback to executor |
| Replanning too often | Triggers on any change | Only replan after retries fail |
| Output inconsistent | No standard format | Use StandardWorkflowOutput |

### Getting Started Tasks

1. **Easy**: Add logging to see what elements are found
2. **Medium**: Implement a new evaluator feedback type
3. **Hard**: Create a new replan strategy

### Resources for Learning

- **Screenshots**: `src/infra/services/dom-service.ts`
- **Planning**: `src/core/agents/task-planner/`
- **Execution**: `src/core/agents/task-executor/`
- **Evaluation**: `src/core/agents/task-evaluator/`

---

## Testing Strategy

### Unit Tests

#### Phase 1 Tests
```typescript
describe('SimpleWorkflowExecutor', () => {
  it('should execute steps in order', async () => {
    const steps = [
      { description: 'Step 1', order: 1 },
      { description: 'Step 2', order: 2 }
    ];
    
    const executor = new SimpleWorkflowExecutor();
    const result = await executor.executeSteps(steps);
    
    expect(result.stepsCompleted).toBe(2);
  });
});
```

#### Phase 2 Tests
```typescript
describe('Feedback Loop', () => {
  it('should retry with evaluator feedback', async () => {
    const executor = new SimpleWorkflowExecutor();
    const step = { description: 'Click search', maxRetries: 3 };
    
    // Mock evaluator to fail first, succeed second
    mockEvaluator
      .onFirstCall().returns({ success: false, feedback: 'Wrong element' })
      .onSecondCall().returns({ success: true });
    
    const result = await executor.executeStep(step);
    
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });
});
```

### Integration Tests

```typescript
describe('End-to-End Workflow', () => {
  it('should complete Amazon search', async () => {
    const executor = new SimpleWorkflowExecutor();
    const result = await executor.executeGoal(
      'Search for coffee beans',
      'https://amazon.com'
    );
    
    expect(result.execution.status).toBe('success');
    expect(result.extractedData.items).toHaveLength(greaterThan(0));
  });
});
```

### Visual Tests

```typescript
describe('Visual Execution', () => {
  it('should identify elements from screenshot', async () => {
    const screenshot = await loadTestScreenshot('amazon-home.png');
    const elements = await identifyElements(screenshot);
    
    const searchBox = elements.find(e => e.type === 'input');
    expect(searchBox).toBeDefined();
    expect(searchBox.index).toBeGreaterThan(0);
  });
});
```

---

## Risk Management

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Visual recognition fails | High | Medium | Fallback to DOM selectors |
| LLM costs increase | Medium | Low | Cache decisions, optimize prompts |
| Performance degradation | Medium | Low | Parallel execution where possible |
| Breaking changes | High | Medium | Feature flags, gradual rollout |

### Mitigation Strategies

1. **Feature Flags**
   ```typescript
   if (FEATURE_FLAGS.USE_VISUAL_EXECUTOR) {
     // New approach
   } else {
     // Fallback to legacy
   }
   ```

2. **Gradual Rollout**
   - 10% traffic → monitor → 50% → monitor → 100%

3. **Performance Monitoring**
   ```typescript
   const metrics = {
     stepDuration: [],
     retryCount: [],
     successRate: []
   };
   ```

4. **Error Recovery**
   ```typescript
   try {
     await newWorkflow.execute();
   } catch (error) {
     console.error('New workflow failed, falling back');
     await legacyWorkflow.execute();
   }
   ```

### Success Metrics

- **Step Success Rate**: Target >90% (current ~70%)
- **Average Retries**: Target <1.5 per step
- **Execution Time**: Target <30s for typical workflow
- **Replan Frequency**: Target <10% of workflows
- **Output Consistency**: 100% schema compliance

---

## Appendix: Code Examples

### Complete Step Execution Example
```typescript
async function executeStepWithFullFlow(step: VisualStep): Promise<StepResult> {
  // 1. Capture visual state
  const visualState = await captureVisualState();
  
  // 2. Generate actions from visual
  const actions = await generateActionsFromVisual(step, visualState);
  
  // 3. Execute actions
  for (const action of actions) {
    await executeVisualAction(action);
  }
  
  // 4. Capture result
  const resultState = await captureVisualState();
  
  // 5. Evaluate
  const evaluation = await evaluateStepCompletion(
    step,
    visualState,
    resultState
  );
  
  // 6. Return result
  return {
    success: evaluation.success,
    data: extractDataFromState(resultState),
    feedback: evaluation.feedback
  };
}
```

### Replan Example
```typescript
async function replanAfterFailure(
  originalPlan: VisualStep[],
  failedStep: VisualStep,
  failures: AttemptHistory[]
): Promise<VisualStep[]> {
  
  // Analyze what went wrong
  const failureAnalysis = analyzeFailures(failures);
  
  // Determine strategy
  const strategy = selectReplanStrategy(failureAnalysis);
  
  switch (strategy) {
    case 'ADD_PREP_STEPS':
      return addPreparationSteps(originalPlan, failedStep);
      
    case 'ALTERNATIVE_PATH':
      return createAlternativePath(originalPlan, failedStep);
      
    case 'SKIP_AND_CONTINUE':
      return skipAndContinue(originalPlan, failedStep);
      
    default:
      return adjustFailedStep(originalPlan, failedStep);
  }
}
```

---

## Conclusion

This plan transforms the current over-engineered system into a simple, visual-first workflow that matches the original vision. Each phase is independently valuable and can be implemented incrementally, reducing risk while delivering immediate improvements.

The key insight is that **web automation should mirror human behavior**: look at the screen, decide what to do, try it, and learn from mistakes. By making screenshots the primary driver and implementing a proper feedback loop, we create a system that's both more intuitive and more effective.

**Next Steps**:
1. Review and approve this plan
2. Begin Phase 1 implementation
3. Set up testing infrastructure
4. Schedule weekly progress reviews

**Success Criteria**:
- Simplified codebase (target: 50% less code)
- Improved success rate (target: >90%)
- Standardized output format
- Clear separation of concerns
- Easy for junior developers to understand and extend