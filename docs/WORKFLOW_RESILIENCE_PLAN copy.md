# Workflow Resilience Enhancement Plan

## Executive Summary
This document outlines critical enhancements to address workflow resilience issues identified during the Amazon multi-agent execution. The plan focuses on preventing infinite loops, improving state persistence, and enabling progressive task completion with minimal changes to the existing implementation.

## Problem Analysis
Based on the execution trace analysis from `output.md`, the multi-agent system exhibited several critical failure patterns:

1. **10+ Replanning Cycles**: The system entered an infinite loop attempting the same failed task
2. **Lost Extracted Data**: Successfully extracted URLs and ratings were not persisted across replans
3. **Rigid Evaluation**: Tasks marked as failed despite achieving acceptable alternatives (e.g., 4-star filter instead of 4.5)
4. **Repeated Failures**: System attempted identical approaches that had already failed
5. **No Graceful Degradation**: Unable to return partial results or "best effort" outcomes

## Implementation Approach
All enhancements will be implemented with:
- **Minimal disruption** to existing code
- **Backward compatibility** maintained
- **Progressive enhancement** - each phase can be deployed independently
- **Configuration-driven** - features can be enabled/disabled via config

---

## Phase 1: Infinite Loop Prevention 🚨 CRITICAL
**Priority**: CRITICAL  
**Complexity**: Low  
**Timeline**: 1-2 days  
**Risk**: High (current system can run indefinitely)

### Problem
The workflow manager has no limit on replanning attempts per step, causing infinite loops when a task consistently fails.

### Solution

#### Step 1.1: Add Replan Tracking to WorkflowManager

**File**: `src/core/services/workflow-manager.ts`

Add replan tracking fields to the class (after line 82):

```typescript
export class WorkflowManager {
  // ... existing fields ...
  private errors: string[] = [];
  
  // NEW
  private replanAttemptsPerStep: Map<string, number> = new Map();
  private failedApproaches: Map<string, string[]> = new Map();
  private maxReplansPerStep: number = 3; // Configurable limit
```

#### Step 1.2: Update WorkflowManagerConfig

**File**: `src/core/services/workflow-manager.ts` (line 25)

```typescript
export interface WorkflowManagerConfig {
  maxRetries?: number;
  timeout?: number;
  enableReplanning?: boolean;
  variableManager?: VariableManager;
  summarizer?: ITaskSummarizer;
  // NEW
  maxReplansPerStep?: number;      // Max replans per individual step
  maxTotalReplans?: number;         // Max replans for entire workflow
  enableDegradation?: boolean;      // Allow degraded success
}
```

#### Step 1.3: Implement Replan Limiting Logic

**File**: `src/core/services/workflow-manager.ts` 

Update the executeWorkflow method (around line 156):

```typescript
// Inside the failure handling block
if (this.config.enableReplanning) {
  const stepId = strategicStep.id;
  const replanCount = this.replanAttemptsPerStep.get(stepId) || 0;
  
  // NEW: Check replan limit
  if (replanCount >= this.maxReplansPerStep) {
    this.reporter.log(`⛔ Step ${stepId} has reached max replan limit (${this.maxReplansPerStep})`);
    
    // Try degradation strategy if enabled
    if (this.config.enableDegradation) {
      this.reporter.log(`📉 Attempting degraded completion...`);
      // Mark as partial success and continue
      this.completedSteps.set(stepId, {
        ...result,
        status: 'partial',
        degraded: true
      });
      successfullyCompletedSteps.push(strategicStep);
      continue; // Move to next step instead of replanning
    } else {
      break; // Stop workflow
    }
  }
  
  // Track replan attempt
  this.replanAttemptsPerStep.set(stepId, replanCount + 1);
  
  // Track failed approach to avoid repetition
  const failedApproach = JSON.stringify({
    approach: strategicStep.description,
    reason: result.errorReason
  });
  
  if (!this.failedApproaches.has(stepId)) {
    this.failedApproaches.set(stepId, []);
  }
  this.failedApproaches.get(stepId)!.push(failedApproach);
  
  this.reporter.log(`⚠️ Step failed (attempt ${replanCount + 1}/${this.maxReplansPerStep}), requesting replan...`);
  
  // Continue with existing replan logic...
```

---

## Phase 2: State Persistence & Accumulation 💾
**Priority**: HIGH  
**Complexity**: Medium  
**Timeline**: 2-3 days

### Problem
Extracted data is lost during replanning, causing the system to repeatedly extract the same information.

### Solution

#### Step 2.1: Create Persistent State Accumulator

**File**: `src/core/services/state-manager.ts`

Add persistent storage (after line 9):

```typescript
export class StateManager {
  private stateHistory: PageState[] = [];
  private currentState: PageState | null = null;
  private extractedData: Map<string, any> = new Map();
  
  // NEW: Persistent data storage
  private persistentData: Map<string, any> = new Map();
  private checkpoints: Map<string, PageState> = new Map();
  
  // NEW: Merge extracted data instead of replacing
  public mergeExtractedData(newData: Record<string, any>): void {
    Object.entries(newData).forEach(([key, value]) => {
      // Only update if value is meaningful (not null/undefined/empty)
      if (value !== null && value !== undefined && value !== '') {
        this.extractedData.set(key, value);
        this.persistentData.set(key, value); // Also persist
      }
    });
  }
  
  // NEW: Get all accumulated data
  public getAllExtractedData(): Record<string, any> {
    return {
      ...Object.fromEntries(this.persistentData),
      ...Object.fromEntries(this.extractedData)
    };
  }
  
  // NEW: Create checkpoint
  public createCheckpoint(name: string): void {
    this.checkpoints.set(name, {
      ...this.currentState!,
      extractedData: this.getAllExtractedData()
    });
  }
```

#### Step 2.2: Update WorkflowManager to Use Persistent State

**File**: `src/core/services/workflow-manager.ts`

Update state handling after task execution (around line 245):

```typescript
// After executor completes
if (execution.finalState?.extractedData && 
    Object.keys(execution.finalState.extractedData).length > 0) {
  // NEW: Merge instead of replace
  this.stateManager.mergeExtractedData(execution.finalState.extractedData);
  
  // Create checkpoint after successful extraction
  this.stateManager.createCheckpoint(`step_${step.id}_complete`);
  
  // Update workflow extractedData with merged data
  this.extractedData = this.stateManager.getAllExtractedData();
}
```

#### Step 2.3: Pass Accumulated Data in ReplanContext

**File**: `src/core/interfaces/agent.interface.ts` (line 76)

```typescript
export interface ReplanContext {
  originalGoal: string;
  completedSteps: StrategicTask[];
  failedStep: StrategicTask;
  failureReason: string;
  currentState: PageState;
  // NEW: Add context about what we've learned
  accumulatedData?: Record<string, any>;
  failedApproaches?: string[];
  attemptNumber?: number;
}
```

---

## Phase 3: Flexible Task Evaluation 🎯
**Priority**: HIGH  
**Complexity**: Medium  
**Timeline**: 2 days

### Problem
The evaluator is too strict, marking tasks as failed even when acceptable alternatives are achieved.

### Solution

#### Step 3.1: Add Evaluation Flexibility to StrategicTask

**File**: `src/core/types/agent-types.ts` (around line 2)

```typescript
export interface StrategicTask {
  // ... existing fields ...
  expectedOutcome: string;
  dependencies: string[];
  maxAttempts: number;
  priority: number;
  
  // NEW: Flexible evaluation criteria
  acceptableOutcomes?: string[];     // Alternative acceptable outcomes
  requiredEvidence?: string[];       // Must-have evidence for success
  optionalEvidence?: string[];       // Nice-to-have evidence
  minSuccessConfidence?: number;     // Minimum confidence for success (default 0.7)
  allowPartialSuccess?: boolean;     // Can this step succeed partially?
}
```

#### Step 3.2: Update Evaluator to Support Flexible Criteria

**File**: `src/core/agents/task-evaluator/task-evaluator.prompt.ts`

Add to the prompt:

```typescript
export const TASK_EVALUATOR_PROMPT = `
... existing prompt ...

## Flexible Evaluation Criteria

When evaluating task success, consider:

1. **Primary Outcome**: Was the main expected outcome achieved?
2. **Acceptable Alternatives**: Are any acceptable alternative outcomes listed? If so, was any achieved?
3. **Required Evidence**: Check all required evidence items are present
4. **Partial Success**: If partial success is allowed, evaluate what percentage was completed

### Success Determination Rules:
- If primary outcome is achieved: SUCCESS (confidence 0.8-1.0)
- If acceptable alternative is achieved: SUCCESS (confidence 0.6-0.8)  
- If partial success allowed and >70% complete: PARTIAL SUCCESS (confidence 0.5-0.7)
- If required evidence is missing: FAILURE
- If outcome is close but not exact (e.g., "4 stars" instead of "4.5 stars"): Consider context

### Example Flexible Evaluation:
Task: "Filter results to 4.5+ stars"
Expected: "Results show only 4.5+ star items"
Acceptable: ["Results show only 4+ star items", "High-rated items are prioritized"]
Result: Applied 4-star filter
Evaluation: SUCCESS with confidence 0.65 (acceptable alternative achieved)
`;
```

#### Step 3.3: Update Evaluator Logic

**File**: `src/core/agents/task-evaluator/task-evaluator.ts` (around line 85)

```typescript
const output: EvaluatorOutput = {
  stepId: input.step.id,
  success: evaluation.success,
  confidence: this.validateConfidence(evaluation.confidence),
  evidence: evaluation.evidence || 'No evidence provided',
  reason: evaluation.reason || 'No reason provided',
  suggestions: evaluation.suggestions || [],
  // NEW: Track partial success
  partialSuccess: evaluation.partialSuccess,
  achievedAlternative: evaluation.achievedAlternative
};

// NEW: Apply flexible success criteria
if (!output.success && input.step.allowPartialSuccess) {
  // Check if we have enough for partial success
  if (output.confidence >= (input.step.minSuccessConfidence || 0.5)) {
    output.success = true;
    output.partialSuccess = true;
    output.reason = `Partial success: ${output.reason}`;
  }
}
```

---

## Phase 4: Enhanced Error Recovery Context 🔍
**Priority**: MEDIUM  
**Complexity**: Low  
**Timeline**: 1 day

### Problem
The system doesn't learn from failures and repeatedly attempts the same failed approaches.

### Solution

#### Step 4.1: Enhance Memory Service Usage

**File**: `src/core/services/workflow-manager.ts`

Update failure handling to record learnings (around line 165):

```typescript
// When a step fails, record the learning
if (!result.success) {
  const context: MemoryContext = {
    url: this.browser.getPageUrl(),
    taskGoal: strategicStep.description,
    pageSection: beforeState.visibleSections[0]
  };
  
  // Record what failed
  this.memoryService.addLearning(
    context,
    `Task "${strategicStep.description}" failed: ${result.errorReason}`,
    {
      actionToAvoid: strategicStep.description,
      alternativeAction: 'Try different approach or selector',
      confidence: 0.8
    }
  );
```

#### Step 4.2: Pass Memory Context to Planner

**File**: `src/core/services/workflow-manager.ts`

Include failure memory in replan context:

```typescript
const replanContext: ReplanContext = {
  originalGoal: goal,
  completedSteps: successfullyCompletedSteps,
  failedStep: strategicStep,
  failureReason: result.errorReason || 'Step execution failed',
  currentState: await this.captureSemanticState(),
  // NEW: Include failure history
  accumulatedData: this.stateManager.getAllExtractedData(),
  failedApproaches: this.failedApproaches.get(strategicStep.id) || [],
  attemptNumber: replanCount + 1
};
```

#### Step 4.3: Update Planner to Use Failure History

**File**: `src/core/agents/task-planner/task-planner.prompt.ts`

Add to replan prompt:

```typescript
## Learning from Failures

When replanning, you MUST:
1. Review the failed approaches list
2. DO NOT repeat any approach that has already failed
3. Try alternative strategies:
   - Different UI elements or selectors
   - Different navigation paths
   - Different interaction methods
   - Simplified goals if original is unachievable

Failed Approaches to Avoid:
{{failedApproaches}}

Attempt Number: {{attemptNumber}} of {{maxAttempts}}
`;
```

---

## Phase 5: Progressive Task Completion ✅
**Priority**: MEDIUM  
**Complexity**: Medium  
**Timeline**: 2 days

### Problem
The system cannot return partial results or "best effort" outcomes when perfect execution isn't possible.

### Solution

#### Step 5.1: Update WorkflowResult Type

**File**: `src/core/types/agent-types.ts`

```typescript
export interface WorkflowResult {
  status: 'success' | 'failure' | 'partial' | 'degraded';
  goal: string;
  completedSteps: number;
  totalSteps: number;
  extractedData: any;
  errors?: string[];
  duration: number;
  // NEW: Progressive completion tracking
  completionPercentage: number;
  partialResults?: any;
  degradedSteps?: string[];
  bestEffortData?: any;
  confidenceScore: number;
}
```

#### Step 5.2: Implement Best Effort Result Building

**File**: `src/core/services/workflow-manager.ts`

Update buildWorkflowResult method:

```typescript
private async buildWorkflowResult(): Promise<WorkflowResult> {
  const endTime = Date.now();
  const duration = this.startTime ? endTime - this.startTime.getTime() : 0;
  
  // Calculate completion percentage
  const totalSteps = this.currentStrategy?.steps.length || 0;
  const completedCount = Array.from(this.completedSteps.values())
    .filter(r => r.success || r.status === 'partial').length;
  const completionPercentage = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;
  
  // Determine overall status
  let status: WorkflowResult['status'] = 'failure';
  if (completionPercentage === 100) {
    status = 'success';
  } else if (completionPercentage >= 70) {
    status = 'partial';
  } else if (completionPercentage >= 40) {
    status = 'degraded';
  }
  
  // Get all accumulated data
  const allExtractedData = this.stateManager.getAllExtractedData();
  
  return {
    status,
    goal: this.currentStrategy?.goal || '',
    completedSteps: completedCount,
    totalSteps,
    extractedData: allExtractedData,
    errors: this.errors,
    duration,
    // NEW: Progressive completion fields
    completionPercentage,
    partialResults: this.extractedData,
    degradedSteps: Array.from(this.completedSteps.entries())
      .filter(([_, r]) => r.degraded)
      .map(([id, _]) => id),
    bestEffortData: allExtractedData,
    confidenceScore: this.calculateOverallConfidence()
  };
}

private calculateOverallConfidence(): number {
  const results = Array.from(this.completedSteps.values());
  if (results.length === 0) return 0;
  
  const avgConfidence = results
    .map(r => (r as any).confidence || 0.5)
    .reduce((a, b) => a + b, 0) / results.length;
    
  return Number(avgConfidence.toFixed(2));
}
```

#### Step 5.3: Add Early Exit with Partial Results

**File**: `src/core/services/workflow-manager.ts`

Add configuration for early exit:

```typescript
export interface WorkflowManagerConfig {
  // ... existing fields ...
  // NEW: Early exit configuration
  allowEarlyExit?: boolean;           // Can workflow exit with partial results?
  minAcceptableCompletion?: number;   // Minimum % completion to exit early (default 60)
  criticalSteps?: string[];           // Step IDs that must complete
}
```

Implement early exit logic:

```typescript
// After each step completion, check if we should exit early
if (this.config.allowEarlyExit) {
  const completion = this.calculateCompletionPercentage();
  const criticalStepsComplete = this.checkCriticalSteps();
  
  if (completion >= (this.config.minAcceptableCompletion || 60) && criticalStepsComplete) {
    this.reporter.log(`✅ Achieved ${completion}% completion with critical steps done. Exiting with partial success.`);
    break;
  }
}
```

---

## Testing & Validation

### Test Scenarios

1. **Infinite Loop Prevention**
   ```typescript
   // Test: Task fails 5 times
   // Expected: Stops after 3 replans, returns partial result
   ```

2. **State Persistence**
   ```typescript
   // Test: Extract data, then replan
   // Expected: Extracted data remains available after replan
   ```

3. **Flexible Evaluation**
   ```typescript
   // Test: Apply 4-star filter when 4.5 requested
   // Expected: Marked as partial success
   ```

4. **Progressive Completion**
   ```typescript
   // Test: Complete 3 of 5 steps successfully
   // Expected: Returns partial success with 60% completion
   ```

### Performance Metrics

Track these metrics to validate improvements:
- Average replanning attempts per workflow
- Data extraction retention rate
- Partial success rate
- Average workflow duration
- Memory consumption

---

## Rollout Strategy

### Phase Ordering
1. **Week 1**: Phase 1 (Loop Prevention) - Critical fix
2. **Week 1-2**: Phase 2 (State Persistence) - High priority
3. **Week 2**: Phase 3 (Flexible Evaluation) - High value
4. **Week 2-3**: Phase 4 (Error Recovery) - Enhancement
5. **Week 3**: Phase 5 (Progressive Completion) - Enhancement

### Configuration Defaults

```typescript
// Conservative defaults for production
const DEFAULT_CONFIG: WorkflowManagerConfig = {
  maxRetries: 3,
  maxReplansPerStep: 3,
  maxTotalReplans: 10,
  enableDegradation: true,
  allowEarlyExit: false,  // Opt-in for early exit
  minAcceptableCompletion: 70,
  enableReplanning: true
};
```

### Monitoring & Alerts

Add metrics for:
- Replan frequency per step
- Data loss incidents  
- Degraded completion rate
- Average confidence scores

---

## Risk Mitigation

### Potential Risks

1. **Breaking Changes**: All changes are backward compatible with config flags
2. **Performance Impact**: Minimal - mostly adds tracking, not processing
3. **Memory Usage**: Bounded by checkpoint limits and data size caps

### Rollback Plan

Each phase can be disabled via configuration:
```typescript
{
  enableReplanning: false,        // Disable all replanning
  maxReplansPerStep: 999,         // Effectively unlimited
  enableDegradation: false,       // Disable degraded success
  allowEarlyExit: false          // Disable partial completion
}
```

---

## Success Criteria

The implementation will be considered successful when:

1. ✅ No workflow runs for more than 15 replan attempts
2. ✅ Extracted data persists across 100% of replanning events
3. ✅ 80% of "close enough" outcomes are marked as partial success
4. ✅ Failed approaches are never repeated in the same workflow
5. ✅ 60% of workflows can return meaningful partial results

---

## Appendix: Code Examples

### Example 1: Degraded Success
```typescript
// Task: Find product rated 4.5+
// Actual: Found product rated 4.4
// Result: Partial success with degradation flag
{
  status: 'partial',
  confidence: 0.65,
  degraded: true,
  reason: 'Found 4.4-star product (close to 4.5 requirement)'
}
```

### Example 2: Progressive Data Accumulation
```typescript
// Attempt 1: Extract price ($29.99)
// Attempt 2: Extract rating (4.6)
// Attempt 3: Extract title (Coffee Beans)
// Result: All data preserved
{
  extractedData: {
    price: '$29.99',
    rating: '4.6',
    title: 'Coffee Beans'
  }
}
```

### Example 3: Early Exit
```typescript
// Goal: Complete 5-step checkout
// Achieved: 3 steps (login, add to cart, view cart)
// Result: Exit with 60% completion
{
  status: 'partial',
  completionPercentage: 60,
  partialResults: { /* cart data */ }
}
```

---

## Next Steps

1. Review and approve this plan
2. Create feature branch: `feature/workflow-resilience`
3. Implement Phase 1 (Critical - Loop Prevention)
4. Test with the problematic Amazon workflow
5. Iterate based on results

## Questions for Review

1. Should we add a "force complete" option for manual intervention?
2. What should be the default confidence thresholds?
3. Should partial results trigger different reporting/alerting?
4. Do we need workflow-level vs global configuration?

---

*Document Version: 1.0*  
*Last Updated: 2024*  
*Status: PENDING REVIEW*