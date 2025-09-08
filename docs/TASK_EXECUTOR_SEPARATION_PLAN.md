# Task Executor Separation Implementation Plan

## Overview
This plan details the refactoring of TaskExecutorAgent to separate micro-action decomposition (AI/LLM concern) from micro-action execution (infrastructure concern). This creates a cleaner architecture following DDD principles with better separation of concerns.

## Current Architecture Problems
1. **TaskExecutorAgent** has dual responsibilities:
   - Decomposing strategic tasks into micro-actions (via LLM)
   - Executing those micro-actions (via MicroActionExecutor)
2. **MicroActionExecutor** is instantiated inside the agent
3. Execution logic is tightly coupled with agent implementation
4. WorkflowManager has no direct control over micro-action execution

## Target Architecture
- **TaskExecutorAgent**: Pure decomposition agent (LLM/AI logic only)
- **MicroActionExecutor**: Infrastructure service for execution
- **BrowserExecutionService**: Orchestrates decomposition and execution
- **WorkflowManager**: Controls the overall workflow with injected services

## Implementation Steps

### Step 1: Update Agent Interface ✅ COMPLETED
**File**: `src/core/interfaces/agent.interface.ts`

#### Changes:
```typescript
// Line 41-47: Update ExecutorOutput interface
export interface ExecutorOutput {
  taskId: string;
  microActions: MicroActionData[];
  // REMOVE: results: ActionResult[];  // This line will be deleted
  finalState: PageState;
  timestamp: Date;
}
```

**Status**: ✅ Completed - Removed `results: ActionResult[]` field from ExecutorOutput interface

### Step 2: Refactor TaskExecutorAgent ✅ COMPLETED
**File**: `src/core/agents/task-executor/task-executor.ts`

#### Remove Imports (Lines 8-10):
```typescript
// DELETE THESE LINES:
import { DomService } from '../../../infra/services/dom-service';
import { MicroActionExecutor } from '../../../infrastructure/services/micro-action-executor';
import { MicroAction, MicroActionData } from '@/core/value-objects/task';
```

#### Keep Only:
```typescript
import { MicroActionData } from '@/core/value-objects/task';
```

#### Update Class Members (Lines 28-35):
```typescript
export class TaskExecutorAgent implements ITaskExecutor {
  public readonly name = 'TaskExecutor';
  public readonly model: string;
  public readonly maxRetries: number;
  
  private llm: LLM;
  private browser: Browser;
  // DELETE: private domService: DomService;
  // DELETE: private microActionExecutor: MicroActionExecutor;
```

#### Update Constructor (Lines 37-48):
```typescript
constructor(llm: LLM, browser: Browser, config: ExecutorConfig) {
  this.llm = llm;
  this.browser = browser;
  // DELETE: this.domService = domService;
  this.model = config.model;
  this.maxRetries = config.maxRetries || 3;
  // DELETE ALL MicroActionExecutor instantiation (lines 43-47)
}
```

#### Replace execute() Method (Lines 53-141):
```typescript
async execute(input: ExecutorInput): Promise<ExecutorOutput> {
  if (!this.validateInput(input)) {
    throw new Error('Invalid executor input provided');
  }

  try {
    // Get DOM state directly from browser page
    const page = this.browser.getPage();
    const domAnalysis = await page.evaluate(() => {
      // Inline DOM inspection logic
      const elements = document.querySelectorAll('*');
      const interactiveElements = [];
      // ... DOM parsing logic to extract interactive elements
      return {
        stringifiedDomState: JSON.stringify(interactiveElements),
        pixelAbove: window.scrollY,
        pixelBelow: document.body.scrollHeight - window.innerHeight - window.scrollY
      };
    });

    // Take screenshots if needed
    const screenshot = await page.screenshot({ encoding: 'base64' });
    const pristineScreenshot = screenshot; // Or separate pristine capture

    // Decompose into micro-actions using LLM
    const microActions = await this.decomposeStrategicStep(
      input.expectedOutcome,
      domAnalysis.stringifiedDomState,
      {
        screenshot,
        pristineScreenshot,
        pixelAbove: domAnalysis.pixelAbove,
        pixelBelow: domAnalysis.pixelBelow
      },
      input.memoryLearnings
    );
    
    console.log(`🔍 Decomposed into ${microActions.length} micro-actions`);

    // Return decomposition result without execution
    const output: ExecutorOutput = {
      taskId: "",
      microActions,
      finalState: await this.captureCurrentState(),
      timestamp: new Date()
    };

    if (!this.validateOutput(output)) {
      throw new Error('Generated invalid executor output');
    }

    return output;

  } catch (error) {
    throw new Error(`Task decomposition failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

#### Update validateOutput() Method (Lines 150-159):
```typescript
validateOutput(output: ExecutorOutput): boolean {
  return !!(
    output &&
    typeof output.taskId === 'string' &&
    Array.isArray(output.microActions) &&
    // DELETE: Array.isArray(output.results) &&
    output.finalState &&
    output.timestamp instanceof Date
  );
}
```

#### Simplify captureCurrentState() Method (Lines 230-238):
```typescript
private async captureCurrentState(): Promise<PageState> {
  return {
    url: this.browser.getPageUrl(),
    title: await this.browser.getPage().title(),
    visibleSections: [],
    availableActions: [],
    extractedData: {} // No longer passed as parameter
  };
}
```

#### Remove Methods (Lines 222-228):
```typescript
// DELETE these methods entirely:
// - shouldRefreshState()
// - wait()
```

**Status**: ✅ Completed - Refactored TaskExecutorAgent to focus only on decomposition:
- Removed DomService and MicroActionExecutor dependencies
- Updated constructor to only take llm, browser, config
- Replaced execution logic with pure decomposition using inline DOM inspection
- Removed execution-related helper methods
- Updated validation methods for new interface

### Step 3: Update BrowserExecutionService ✅ COMPLETED
**File**: `src/infrastructure/services/browser-execution-service.ts`

#### Update Imports:
```typescript
import { MicroAction, MicroActionData } from '../../core/value-objects/task';
import { ActionResult } from '../../core/types/agent-types';
```

#### Update Constructor (Lines 24-31):
```typescript
constructor(
  llm: LLM,
  browser: Browser,
  private domService: DomService,
  private microActionExecutor: MicroActionExecutor,  // Now injected, not created
  config: ExecutorConfig
) {
  // TaskExecutor no longer needs domService
  this.taskExecutorAgent = new TaskExecutorAgent(llm, browser, config);
}
```

#### Replace executeTask() Method (Lines 33-147):
```typescript
async executeTask(
  task: Task,
  config: Partial<StepExecutionConfig> = {}
): Promise<Result<EnhancedTaskResult>> {
  const startTime = new Date();
  const evidence: Evidence[] = [];
  const actionsTaken: ExecutionAction[] = [];
  
  try {
    // Start task execution in domain
    const taskStartResult = task.execute();
    if (taskStartResult.isFailure()) {
      throw new Error(`Failed to start task: ${taskStartResult.getError()}`);
    }
    
    // PHASE 1: Decomposition via TaskExecutorAgent
    const executorInput = this.convertTaskToExecutorInput(task);
    const decomposition = await this.taskExecutorAgent.execute(executorInput);
    
    if (!decomposition.microActions || decomposition.microActions.length === 0) {
      throw new Error('No micro-actions generated for task');
    }
    
    // PHASE 2: Execution via MicroActionExecutor
    const executionResults: ActionResult[] = [];
    const extractedData: Record<string, any> = {};
    
    for (const microActionData of decomposition.microActions) {
      try {
        // Create MicroAction value object
        const actionResult = MicroAction.create(microActionData);
        if (!actionResult.isSuccess()) {
          throw new Error(`Invalid micro-action: ${actionResult.getError()}`);
        }
        
        const action = actionResult.getValue();
        
        // Execute the micro-action
        const result = await this.microActionExecutor.execute(action);
        executionResults.push(result);
        
        // Stop on failure
        if (!result.success) {
          console.log(`❌ Micro-action failed: ${action.getDescription()}`);
          break;
        }
        
        // Collect extracted data
        if (action.isExtractionAction() && result.extractedValue !== null) {
          const key = action.getDescription() || `extracted_${Date.now()}`;
          extractedData[key] = result.extractedValue;
          console.log(`📊 Extracted data: ${key}`);
        }
        
        // Add slight delay between actions for stability
        if (action.modifiesPageState()) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (error) {
        // Create error result for this micro-action
        executionResults.push({
          action: microActionData,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
          duration: 0
        });
        break;
      }
    }
    
    // Determine overall success
    const allSuccessful = executionResults.length > 0 && 
                         executionResults.every(r => r.success);
    
    // Build task result
    const taskResult: TaskResult = {
      taskId: task.getId().toString(),
      success: allSuccessful,
      duration: Date.now() - startTime.getTime(),
      timestamp: new Date(),
      data: Object.keys(extractedData).length > 0 ? extractedData : undefined
    };
    
    // Complete the task in domain
    const taskCompletionResult = task.complete(taskResult);
    if (taskCompletionResult.isFailure()) {
      return Result.fail(`Failed to complete task: ${taskCompletionResult.getError()}`);
    }
    
    // Collect evidence if enabled
    if (config.evidenceCollection !== false) {
      evidence.push(...this.createExecutionEvidence(
        decomposition.microActions,
        executionResults,
        extractedData
      ));
    }
    
    // Convert results to ExecutionActions
    actionsTaken.push(...this.convertResultsToExecutionActions(
      executionResults,
      task.getId()
    ));
    
    // Create enhanced result
    const enhancedResult: EnhancedTaskResult = {
      ...taskResult,
      executionTime: Duration.fromMilliseconds(Date.now() - startTime.getTime()).getValue(),
      retryCount: 0,
      evidence,
      actionsTaken,
      confidenceScore: this.calculateConfidenceScore(taskResult, evidence, 0),
      errorDetails: undefined
    };
    
    return Result.ok(enhancedResult);
    
  } catch (error) {
    return Result.fail(`Task execution error: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

#### Add New Helper Method:
```typescript
private createExecutionEvidence(
  microActions: MicroActionData[],
  results: ActionResult[],
  extractedData: Record<string, any>
): Evidence[] {
  const evidence: Evidence[] = [];
  
  // Evidence for micro-actions
  if (microActions.length > 0) {
    const actionsEvidence = Evidence.create(
      'execution-log',
      JSON.stringify({
        actions: microActions,
        results: results.map(r => ({
          success: r.success,
          error: r.error,
          duration: r.duration
        }))
      }),
      {
        source: 'browser-execution-service',
        description: `Executed ${results.filter(r => r.success).length}/${microActions.length} actions successfully`,
        confidence: 90
      }
    );
    
    if (actionsEvidence.isSuccess()) {
      evidence.push(actionsEvidence.getValue());
    }
  }
  
  // Evidence for extracted data
  if (Object.keys(extractedData).length > 0) {
    const dataEvidence = Evidence.create(
      'extracted-data',
      JSON.stringify(extractedData),
      {
        source: 'browser-execution-service',
        description: `Extracted ${Object.keys(extractedData).length} data fields`,
        confidence: 95
      }
    );
    
    if (dataEvidence.isSuccess()) {
      evidence.push(dataEvidence.getValue());
    }
  }
  
  return evidence;
}

private convertResultsToExecutionActions(
  results: ActionResult[],
  taskId: TaskId
): ExecutionAction[] {
  return results.map(result => {
    const action = result.action as MicroActionData;
    return {
      taskId,
      action: this.convertToActionType(action.type),
      timestamp: result.timestamp,
      success: result.success,
      input: action.value?.toString()
    };
  });
}
```

**Status**: ✅ Completed - Updated BrowserExecutionService to orchestrate decomposition and execution:
- Added MicroActionExecutor as injected dependency
- Updated constructor to accept MicroActionExecutor parameter  
- Completely rewrote executeTask method with two-phase architecture:
  - Phase 1: Decomposition via TaskExecutorAgent
  - Phase 2: Execution via MicroActionExecutor
- Added new helper methods: createExecutionEvidence() and convertResultsToExecutionActions()
- Improved error handling and evidence collection for both phases

### Step 4: Update WorkflowManager ✅ COMPLETED
**File**: `src/core/services/workflow-manager.ts`

#### Add Import:
```typescript
import { MicroActionExecutor } from '../../infrastructure/services/micro-action-executor';
```

#### Update Constructor (Lines 109-122):
```typescript
constructor(
  private llm: LLM,
  private executionService: ExecutionService,
  private evaluationService: EvaluationService,
  private workflowRepository: WorkflowRepository,
  private planRepository: PlanRepository,
  private memoryRepository: MemoryRepository,
  private eventBus: EnhancedEventBusInterface,
  private browser: Browser,
  private domService: DomService,
  private microActionExecutor: MicroActionExecutor,  // NEW PARAMETER
  private reporter: AgentReporter,
  private summarizer: ITaskSummarizer,
  private config: WorkflowManagerConfig = {}
) {
  // ... existing initialization
}
```

Note: The executeTask method doesn't need changes since it uses ExecutionService abstraction.

**Status**: ✅ Completed - Updated WorkflowManager constructor:
- Added MicroActionExecutor import
- Updated constructor to accept microActionExecutor parameter
- Added void reference to satisfy TypeScript unused variable warning

### Step 5: Update Initialization Code ✅ COMPLETED
**File**: `src/init-multi-agent.ts`

#### Update initMultiAgent Function:
```typescript
import { MicroActionExecutor } from './infrastructure/services/micro-action-executor';

export function initMultiAgent(config: MultiAgentConfig) {
  // ... existing setup ...
  
  // Create MicroActionExecutor
  const microActionExecutor = new MicroActionExecutor(
    browser,
    domService,
    variableManager
  );
  
  // Update BrowserExecutionService creation
  const executionService = new BrowserExecutionService(
    llm,
    browser,
    domService,
    microActionExecutor,  // Pass the instance
    executorConfig
  );
  
  // Update WorkflowManager creation
  const workflowManager = new WorkflowManager(
    llm,
    executionService,
    evaluationService,
    workflowRepository,
    planRepository,
    memoryRepository,
    eventBus,
    browser,
    domService,
    microActionExecutor,  // Pass the instance
    reporter,
    taskSummarizer,
    workflowConfig
  );
  
  // ... rest of initialization
}
```

**Status**: ✅ Completed - Updated initialization code:
- Updated WorkflowFactory to create and inject MicroActionExecutor
- Added VariableManager and MicroActionExecutor imports
- Modified WorkflowFactory.create method to instantiate MicroActionExecutor with VariableManager
- Updated createDomainServices method to accept and pass MicroActionExecutor to BrowserExecutionService
- Added void reference to satisfy TypeScript unused variable warning in BrowserExecutionService

### Step 6: Update Agent Factory ✅ COMPLETED
**File**: `src/core/factories/agent-factory.ts`

#### Update createTaskExecutor Method:
```typescript
static createTaskExecutor(
  llm: LLM,
  browser: Browser,
  config: ExecutorConfig
): ITaskExecutor {
  // No longer pass domService
  return new TaskExecutorAgent(llm, browser, config);
}
```

**Status**: ✅ Completed - Updated AgentFactory:
- Modified createExecutor method to remove domService parameter
- Updated TaskExecutorAgent instantiation to use new constructor signature (llm, browser, config)

## Implementation Results

### ✅ All Steps Completed Successfully
- **Step 1**: ✅ Updated ExecutorOutput interface (removed results field)
- **Step 2**: ✅ Refactored TaskExecutorAgent (pure decomposition, no execution)
- **Step 3**: ✅ Updated BrowserExecutionService (orchestrates decomposition + execution)
- **Step 4**: ✅ Updated WorkflowManager (accepts MicroActionExecutor parameter)
- **Step 5**: ✅ Updated initialization code (creates and injects MicroActionExecutor)
- **Step 6**: ✅ Updated AgentFactory (removes domService dependency)

### Additional Fixes Applied
- Fixed TypeScript compilation errors in task-executor.ts:
  - Added proper typing for interactiveElements array
  - Fixed onclick property access with type assertion
  - Fixed screenshot API usage to return proper base64 string
- Resolved unused variable warnings with void references
- Removed unused imports across multiple files
- Project now builds successfully with `npm run build`

## Testing Plan

### Unit Tests to Update:
1. `TaskExecutorAgent` tests - Remove execution tests, focus on decomposition
2. `BrowserExecutionService` tests - Add orchestration tests
3. `WorkflowManager` tests - Update constructor calls

### Integration Tests:
1. Test full workflow with new architecture
2. Verify micro-action decomposition quality
3. Verify execution results match expected outcomes
4. Test error handling at each layer

### Manual Testing:
1. Run existing Amazon workflow
2. Run existing GitHub workflow
3. Verify extraction features still work
4. Check error recovery behavior

## Rollback Plan
If issues are discovered:
1. Git revert the commit
2. The changes are isolated enough that reverting is safe
3. No data migration needed

## Success Metrics
- All existing workflows continue to function
- Clear separation between decomposition and execution in logs
- Ability to mock/test each component independently
- Reduced coupling between domain and infrastructure layers

## Timeline
- Step 1-2: Update interfaces and TaskExecutorAgent (30 min)
- Step 3: Update BrowserExecutionService (45 min)
- Step 4-6: Update initialization and factories (30 min)
- Testing: Run existing workflows (30 min)
- Total: ~2.5 hours

## Notes
- This is a breaking change - WorkflowManager is the only consumer
- No migration phase needed since we're doing a clean break
- The refactoring aligns with DDD principles by separating domain logic (decomposition) from infrastructure (execution)