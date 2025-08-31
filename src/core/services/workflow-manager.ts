import { 
  ITaskPlanner, 
  ITaskExecutor, 
  ITaskEvaluator,
  PlannerInput,
  ExecutorInput,
  EvaluatorInput,
  StrategicTask,
  StrategicPlan,
  StepResult,
  PageState,
  WorkflowResult,
  ReplanContext,
} from '../types/agent-types';
import { ITaskSummarizer, SummarizerInput } from '../interfaces/agent.interface';
import { EnhancedEventBusInterface } from '../interfaces/event-bus.interface';
import { Browser } from '../interfaces/browser.interface';
import { DomService } from '@/infra/services/dom-service';
import { AgentReporter } from '../interfaces/agent-reporter.interface';
import { StateManager } from './state-manager';
import { MemoryService, MemoryContext } from './memory-service';
import { VariableManager } from './variable-manager';
import { truncateExtractedData } from '../shared/utils';

export interface WorkflowManagerConfig {
  maxRetries?: number;
  timeout?: number;
  enableReplanning?: boolean;
  variableManager?: VariableManager;
  summarizer?: ITaskSummarizer;
  maxReplansPerStep?: number;      // Max replans per individual step
  maxTotalReplans?: number;         // Max replans for entire workflow
  enableDegradation?: boolean;      // Allow degraded success
  allowEarlyExit?: boolean;           // Can workflow exit with partial results?
  minAcceptableCompletion?: number;   // Minimum % completion to exit early (default 60)
  criticalSteps?: string[];           // Step IDs that must complete
}

/**
 * Sanitizes objects for logging by removing screenshot data
 * to prevent excessive log file sizes.
 */
function sanitizeForLogging(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLogging(item));
  }
  
  const sanitized: any = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      // Omit screenshot fields
      if (key === 'screenshot' || key === 'pristineScreenshot' || key === 'highlighted') {
        sanitized[key] = '[SCREENSHOT_OMITTED]';
      } else if (key === 'screenshots' && typeof obj[key] === 'object') {
        // Handle screenshots object
        sanitized[key] = {};
        for (const screenshotKey in obj[key]) {
          sanitized[key][screenshotKey] = '[SCREENSHOT_OMITTED]';
        }
      } else {
        // Recursively sanitize nested objects
        sanitized[key] = sanitizeForLogging(obj[key]);
      }
    }
  }
  
  return sanitized;
}

export class WorkflowManager {
  private currentStrategy: StrategicPlan | null = null;
  private completedSteps: Map<string, StepResult> = new Map();
  private startTime: Date | null = null;
  private extractedData: any = {};
  private stateManager: StateManager;
  private memoryService: MemoryService;
  private variableManager: VariableManager;
  private summarizer?: ITaskSummarizer;
  private errors: string[] = [];
  
  private replanAttemptsPerStep: Map<string, number> = new Map();
  private failedApproaches: Map<string, string[]> = new Map();
  private maxReplansPerStep: number = 3; // Configurable limit

  constructor(
    private planner: ITaskPlanner,
    private executor: ITaskExecutor,
    private evaluator: ITaskEvaluator,
    private eventBus: EnhancedEventBusInterface,
    private browser: Browser,
    private domService: DomService,
    private reporter: AgentReporter,
    private config: WorkflowManagerConfig = {}
  ) {
    this.config = {
      maxRetries: 3,
      timeout: 300000,
      enableReplanning: true,
      maxReplansPerStep: 3,
      enableDegradation: true,
      allowEarlyExit: false,  // Opt-in for early exit
      minAcceptableCompletion: 60,
      criticalSteps: [],
      ...config
    };
    this.maxReplansPerStep = this.config.maxReplansPerStep || 3;
    this.stateManager = new StateManager(browser, domService);
    this.memoryService = new MemoryService(this.eventBus);
    this.variableManager = config.variableManager || new VariableManager();
    if (config.summarizer) {
      this.summarizer = config.summarizer;
    }
  }

  async executeWorkflow(goal: string, startUrl?: string): Promise<WorkflowResult> {
    this.startTime = new Date();
    this.reporter.log(`🚀 Starting workflow: ${goal}`);
    
    try {
      // Initialize browser with start URL
      const initialUrl = startUrl || 'https://amazon.com';
      await this.browser.launch(initialUrl);
      this.reporter.log(`🌐 Browser launched at: ${initialUrl}`);
      
      // Emit workflow started event
      this.emitWorkflowEvent('workflow:started', { goal });
      
      // Get current URL after browser launch
      const currentUrl = this.browser.getPageUrl();
      
      // Create initial strategic plan
      const currentState = await this.captureSemanticState();
      const plannerInput: PlannerInput = {
        goal,
        currentUrl,
        constraints: [],
        currentState // NEW: Include current page state with screenshots
      };
      
      const plannerOutput = await this.planner.execute(plannerInput);

      this.reporter.log(`🔍 Planner output: ${JSON.stringify(sanitizeForLogging(plannerOutput), null, 2)}`);
      this.currentStrategy = {
        id: plannerOutput.id,
        goal: plannerOutput.goal,
        steps: plannerOutput.strategy,
        createdAt: plannerOutput.createdAt,
        currentStepIndex: plannerOutput.currentStepIndex
      };
      this.reporter.log(`📋 Strategic plan created with ${this.currentStrategy.steps.length} steps`);
      
      // Execute strategic steps with adaptive replanning
      // Track which steps have been successfully completed
      const successfullyCompletedSteps: StrategicTask[] = [];
      
      for (let i = 0; i < this.currentStrategy.steps.length; i++) {
        const strategicStep = this.currentStrategy.steps[i];
        const result = await this.executeStrategicStep(strategicStep);
        
        if (result.success) {
          successfullyCompletedSteps.push(strategicStep);
          
          // Check if we should exit early with partial results
          if (this.config.allowEarlyExit) {
            const completion = this.calculateCompletionPercentage();
            const criticalStepsComplete = this.checkCriticalSteps();
            
            if (completion >= (this.config.minAcceptableCompletion || 60) && criticalStepsComplete) {
              this.reporter.log(`✅ Achieved ${completion.toFixed(1)}% completion with critical steps done. Exiting with partial success.`);
              break;
            }
          }
        } else {
          // Record failure learning when a step fails
          const beforeState = await this.captureSemanticState();
          const context: MemoryContext = {
            url: this.browser.getPageUrl(),
            taskGoal: strategicStep.description,
            pageSection: beforeState.visibleSections[0]
          };
          
          // Record what failed for future reference
          this.memoryService.addLearning(
            context,
            `Task "${strategicStep.description}" failed: ${result.errorReason}`,
            {
              actionToAvoid: strategicStep.description,
              alternativeAction: 'Try different approach or selector',
              confidence: 0.8
            }
          );
          
          if (this.config.enableReplanning) {
            const stepId = strategicStep.id;
            const replanCount = this.replanAttemptsPerStep.get(stepId) || 0;
            
            // Check replan limit
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
            
            // Replan from current state when a step fails
            // Pass successfully completed steps, not just slice by index
            const currentState = await this.captureSemanticState();
            const memoryContext: MemoryContext = {
              url: this.browser.getPageUrl(),
              taskGoal: strategicStep.description,
              pageSection: currentState.visibleSections[0]
            };
            
            const replanContext: ReplanContext = {
              originalGoal: goal,
              completedSteps: successfullyCompletedSteps,
              failedStep: strategicStep,
              failureReason: result.errorReason || 'Step execution failed',
              currentState: currentState,
              accumulatedData: this.stateManager.getAllExtractedData(),
              failedApproaches: this.failedApproaches.get(strategicStep.id) || [],
              attemptNumber: replanCount + 1,
              memoryLearnings: this.memoryService.getMemoryPrompt(memoryContext)
            };
            
            const replanOutput = await this.planner.replan(replanContext);
            this.currentStrategy = {
              id: replanOutput.id,
              goal: replanOutput.goal,
              steps: replanOutput.strategy,
              createdAt: replanOutput.createdAt,
              currentStepIndex: replanOutput.currentStepIndex
            };
            this.reporter.log(`🔄 New plan created with ${this.currentStrategy.steps.length} steps`);
            
            // Start from the new plan
            i = -1; // Will be incremented to 0
          } else {
            this.reporter.log(`❌ Step failed and replanning is disabled`);
            break;
          }
        }
      }
      
      return await this.buildWorkflowResult();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emitWorkflowEvent('workflow:error', { error: errorMessage });
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  private async executeStrategicStep(step: StrategicTask): Promise<StepResult> {
    this.emitWorkflowEvent('step:started', { step });
    this.reporter.log(`⚡ Executing: ${step.description}`);
    
    const startTime = Date.now();
    
    try {
      // Capture state with screenshots before execution
      const beforeState = await this.captureSemanticState();
      
      // Get full DOM state for executor
      const domState = await this.domService.getInteractiveElements();
      
      // NEW: Get memory context
      const memoryContext: MemoryContext = {
        url: this.browser.getPageUrl(),
        taskGoal: step.description,
        pageSection: beforeState.visibleSections[0] // Primary section
      };
      
      // NEW: Add memory and variable manager to executor input
      const executorInput: ExecutorInput = {
        task: step,
        pageState: beforeState,
        screenshots: {
          pristine: domState.pristineScreenshot,
          highlighted: domState.screenshot
        },
        memoryLearnings: this.memoryService.getMemoryPrompt(memoryContext),
        variableManager: this.variableManager
      };

      this.reporter.log(`🔍 Executor input: ${JSON.stringify(sanitizeForLogging(executorInput))}`);
      
      const execution = await this.executor.execute(executorInput);
      
      // Capture state with screenshots after execution
      // IMPORTANT: Use executor's finalState if it contains extracted data
      let afterState: PageState;
      
      if (execution.finalState?.extractedData && 
          Object.keys(execution.finalState.extractedData).length > 0) {
        // Use the executor's state which contains extracted data
        afterState = execution.finalState;
        
        // Merge instead of individual adds to ensure persistence
        this.stateManager.mergeExtractedData(execution.finalState.extractedData);
        
        // Create checkpoint after successful extraction
        this.stateManager.createCheckpoint(`step_${step.id}_complete`);
        
        this.reporter.log(`📊 Using extracted data from executor: ${JSON.stringify(truncateExtractedData(execution.finalState.extractedData))}`);
      } else {
        // Fall back to capturing new state if no extracted data
        afterState = await this.captureSemanticState();
      }
      
      // Update workflow extractedData with merged data from StateManager
      this.extractedData = this.stateManager.getAllExtractedData();
      
      // Log the accumulated data
      if (Object.keys(this.extractedData).length > 0) {
        this.reporter.log(`📊 Accumulated extracted data: ${JSON.stringify(truncateExtractedData(this.extractedData))}`);
      }
      
      // MODIFIED: Pass screenshots to evaluator
      const evaluatorInput: EvaluatorInput = {
        step,
        beforeState: beforeState,
        afterState: afterState,
        microActions: execution.microActions,
        results: execution.results,
        screenshots: {
          before: beforeState.pristineScreenshot || '',
          after: afterState.pristineScreenshot || ''
        }
      };
      
      this.reporter.log(`🔍 Evaluator input: ${JSON.stringify(sanitizeForLogging(evaluatorInput), null, 2)}`);
      
      const evaluation = await this.evaluator.execute(evaluatorInput);
      this.reporter.log(`🔍 Evaluator output: ${JSON.stringify(sanitizeForLogging(evaluation), null, 2)}`);
      
      // Debug logging for extraction data flow
      if (step.intent === 'extract') {
        this.reporter.log(`🔍 Debug - Extraction Task Results:`);
        this.reporter.log(`  - Executor returned data: ${execution.finalState?.extractedData ? 'YES' : 'NO'}`);
        this.reporter.log(`  - Data keys: ${Object.keys(execution.finalState?.extractedData || {}).join(', ')}`);
        this.reporter.log(`  - AfterState has data: ${afterState.extractedData ? 'YES' : 'NO'}`);
        this.reporter.log(`  - AfterState keys: ${Object.keys(afterState.extractedData || {}).join(', ')}`);
      }
      
      const stepResult: StepResult = {
        stepId: step.id,
        success: evaluation.success,
        status: evaluation.success ? 'success' : 'failure',
        microActions: execution.microActions,
        evidence: {
          beforeState,
          afterState,
          extractedData: afterState.extractedData
        },
        errorReason: evaluation.reason,
        duration: Date.now() - startTime,
        attempts: 1
      };
      
      if (evaluation.success) {
        this.memoryService.learnFromSuccess(
          memoryContext,
          `${step.intent}: ${step.description}`,
          evaluation.evidence
        );
      } else {
        this.memoryService.learnFromFailure(
          memoryContext,
          `${step.intent}: ${step.description}`,
          evaluation.reason,
          evaluation.suggestions?.[0]
        );
      }
      
      // Store result
      this.completedSteps.set(step.id, stepResult);
      
      const status = stepResult.status === 'success' ? '✅' : '❌';
      this.reporter.log(`${status} ${step.description} (${stepResult.duration}ms)`);
      
      this.emitWorkflowEvent('step:completed', { 
        step, 
        result: stepResult,
        microActions: execution.microActions 
      });
      
      return stepResult;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.errors.push(`Step ${step.id}: ${errorMessage}`);
      const stepResult: StepResult = {
        stepId: step.id,
        success: false,
        status: 'failure',
        microActions: [],
        evidence: {},
        errorReason: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        attempts: 1
      };
      
      this.completedSteps.set(step.id, stepResult);
      this.emitWorkflowEvent('step:failed', { step, result: stepResult });
      
      return stepResult;
    }
  }

  private async captureSemanticState(): Promise<PageState> {
    // Use StateManager which now captures screenshots
    return await this.stateManager.captureState();
  }


  private async buildWorkflowResult(): Promise<WorkflowResult> {
    const endTime = new Date();
    const duration = this.startTime ? endTime.getTime() - this.startTime.getTime() : 0;
    
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
    
    // Base result object
    const baseResult = {
      id: `workflow-${Date.now()}`,
      goal: this.currentStrategy?.goal || '',
      status,
      completedTasks: Array.from(this.completedSteps.keys()),
      completedSteps: Array.from(this.completedSteps.values()).map(result => ({
        id: result.stepId,
        name: result.stepId,
        description: `Completed step: ${result.stepId}`,
        intent: 'completed' as any,
        targetConcept: 'completed',
        inputData: null,
        expectedOutcome: 'completed',
        dependencies: [],
        maxAttempts: 1,
        priority: 1
      })),
      failedTasks: Array.from(this.completedSteps.values()).filter(r => !r.success).map(r => r.stepId),
      totalDuration: duration,
      duration,
      startTime: this.startTime || new Date(),
      endTime: endTime,
      extractedData: allExtractedData,
      summary: `Workflow completed with ${completedCount}/${totalSteps} successful steps (${completionPercentage.toFixed(1)}%)`,
      errors: this.errors,
      // NEW: Phase 5 - Progressive completion fields
      completionPercentage: Number(completionPercentage.toFixed(1)),
      partialResults: this.extractedData,
      degradedSteps: Array.from(this.completedSteps.entries())
        .filter(([_, r]) => r.degraded)
        .map(([id, _]) => id),
      bestEffortData: allExtractedData,
      confidenceScore: this.calculateOverallConfidence()
    };
    
    // If summarizer is available, enhance the result
    if (this.summarizer) {
      try {
        const summarizerInput: SummarizerInput = {
          goal: this.currentStrategy?.goal || '',
          plan: this.currentStrategy?.steps || [],
          completedSteps: Array.from(this.completedSteps.values()),
          extractedData: allExtractedData,
          totalDuration: duration,
          startTime: this.startTime || new Date(),
          endTime: endTime,
          errors: this.errors,
          url: this.browser.getPage().url()
        };
        
        const structuredSummary = await this.summarizer.execute(summarizerInput);
        
        return {
          ...baseResult,
          structuredSummary,
          summary: structuredSummary.summary,
          cleanData: structuredSummary.extractedFields
        };
      } catch (error) {
        this.reporter.log(`⚠️ Summarizer failed, using basic result: ${error}`);
        return baseResult;
      }
    }
    
    return baseResult;
  }

  private calculateOverallConfidence(): number {
    const results = Array.from(this.completedSteps.values());
    if (results.length === 0) return 0;
    
    const avgConfidence = results
      .map(r => (r as any).confidence || 0.5)
      .reduce((a, b) => a + b, 0) / results.length;
      
    return Number(avgConfidence.toFixed(2));
  }

  private calculateCompletionPercentage(): number {
    const totalSteps = this.currentStrategy?.steps.length || 0;
    const completedCount = Array.from(this.completedSteps.values())
      .filter(r => r.success || r.status === 'partial').length;
    return totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;
  }

  private checkCriticalSteps(): boolean {
    const criticalSteps = this.config.criticalSteps || [];
    if (criticalSteps.length === 0) return true; // No critical steps defined
    
    return criticalSteps.every(stepId => {
      const stepResult = this.completedSteps.get(stepId);
      return stepResult && (stepResult.success || stepResult.status === 'partial');
    });
  }

  private emitWorkflowEvent(event: keyof import('../interfaces/event-bus.interface').AppEvents, data: any): void {
    this.eventBus.emit(event, data);
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.reporter.log('🛑 Browser closed');
    }
  }
}