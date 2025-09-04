import { 
  StrategicTask,
  StrategicPlan,
  StepResult,
  PageState,
  WorkflowResult,
} from '../types/agent-types';
import { ITaskSummarizer, SummarizerInput } from '../interfaces/agent.interface';
import { EnhancedEventBusInterface } from '../interfaces/event-bus.interface';
import { Browser } from '../interfaces/browser.interface';
import { DomService } from '@/infra/services/dom-service';
import { AgentReporter } from '../interfaces/agent-reporter.interface';
import { StateManager } from './state-manager';
import { MemoryService, MemoryContext } from './memory-service';
import { VariableManager } from './variable-manager';
import { 
  PlanningService, 
  ExecutionService, 
  EvaluationService,
  PlanningContext
} from '../domain-services';
import { 
  WorkflowEventBus,
  WorkflowEventBusFactory
} from './domain-event-bridge';
import { DomainEvent } from '../domain-events';
import { 
  EventHandlerFactory,
  WorkflowMetricsHandler,
  WorkflowLoggingHandler,
  TaskFailureHandler,
  WorkflowStuckHandler
} from '../../infrastructure/event-handlers';
import { InMemoryEventStore, IEventStore } from '../domain-events';
import { WorkflowSaga, SagaFactory } from '../sagas';
import {
  WorkflowRepository,
  PlanRepository,
  MemoryRepository
} from '../repositories';
import {
  Workflow,
  Plan,
  Result,
  Session,
  ExecutionContext
} from '../entities';
import {
  WorkflowId,
  Variable,
  Url,
  SessionId,
  Viewport,
  Evidence,
  PageState as PageStateVO
} from '../value-objects';
import {
  WorkflowAggregate,
  ExecutionAggregate
} from '../aggregates';

export interface WorkflowManagerConfig {
  maxRetries?: number;
  timeout?: number;
  enableReplanning?: boolean;
  variableManager?: VariableManager;
  summarizer?: ITaskSummarizer;
  maxReplansPerStep?: number; 
  maxTotalReplans?: number;
  allowEarlyExit?: boolean;
  minAcceptableCompletion?: number;
  criticalSteps?: string[];
  stateManager?: StateManager;
}

interface StateChangeAnalysis {
  requiresReplanning: boolean;
  reason: string;
}


export class WorkflowManager {
  private workflowAggregate: WorkflowAggregate | null = null;
  private executionAggregate: ExecutionAggregate | null = null;
  
  private workflow: Workflow | null = null;
  private currentPlan: Plan | null = null;
  private currentGoal: string = '';
  private currentStrategy: StrategicPlan | null = null;
  private completedSteps: Map<string, StepResult> = new Map();
  private startTime: Date | null = null;
  private extractedData: any = {};
  private stateManager: StateManager;
  private memoryService: MemoryService;
  private summarizer?: ITaskSummarizer;
  private errors: string[] = [];
  

  private workflowEventBus: WorkflowEventBus;
  private metricsHandler: WorkflowMetricsHandler;
  private loggingHandler: WorkflowLoggingHandler;
  private taskFailureHandler: TaskFailureHandler;
  private workflowStuckHandler: WorkflowStuckHandler;
  private eventStore: IEventStore;
  private workflowSaga: WorkflowSaga;

  constructor(
    private planningService: PlanningService,
    private executionService: ExecutionService,
    private evaluationService: EvaluationService,
    private workflowRepository: WorkflowRepository,
    private planRepository: PlanRepository,
    private memoryRepository: MemoryRepository,
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
      allowEarlyExit: false,
      minAcceptableCompletion: 60,
      criticalSteps: [],
      ...config
    };
    
    this.stateManager = new StateManager(this.browser, this.domService);
    this.memoryService = new MemoryService(this.eventBus, this.memoryRepository);
    if (config.summarizer) {
      this.summarizer = config.summarizer;
    }
    this.setupStateManagerEventListeners();
    this.connectDomainEventsToMonitor();
    
    // Services are now directly injected as constructor parameters

    this.workflowEventBus = WorkflowEventBusFactory.create(this.eventBus);
    this.eventStore = new InMemoryEventStore();
    
    // Create and register all advanced event handlers
    const handlers = EventHandlerFactory.createAdvancedHandlers(true);
    this.metricsHandler = handlers.metrics;
    this.loggingHandler = handlers.logging;
    this.taskFailureHandler = handlers.taskFailure;
    this.workflowStuckHandler = handlers.workflowStuck;
    
    // Create and register workflow saga
    this.workflowSaga = SagaFactory.createWorkflowSaga(this.reporter);
    
    // Register all handlers with the domain event bus
    this.workflowEventBus.registerDomainEventHandler(this.metricsHandler);
    this.workflowEventBus.registerDomainEventHandler(this.loggingHandler);
    this.workflowEventBus.registerDomainEventHandler(this.taskFailureHandler);
    this.workflowEventBus.registerDomainEventHandler(this.workflowStuckHandler);
    this.workflowEventBus.registerDomainEventHandler(this.workflowSaga);
    
    this.reporter.log('📡 Domain event handlers registered: metrics, logging, task-failure, workflow-stuck, saga');
  }

  private createWorkflow(goal: string, startUrl: string, variables: Variable[] = []): Result<Workflow> {
    const workflowId = WorkflowId.generate();
    const urlResult = Url.create(startUrl);
    
    if (!urlResult.isSuccess()) {
      return Result.fail(`Invalid start URL: ${urlResult.getError()}`);
    }

    const workflow = new Workflow(
      workflowId,
      goal,
      urlResult.getValue(),
      variables
    );

    return Result.ok(workflow);
  }

  private createSession(workflowId: WorkflowId): Result<Session> {
    const sessionId = SessionId.generate();
    const browserConfig = {
      headless: true,
      viewport: { width: 1920, height: 1080 },
      timeout: 30000
    };
    
    return Session.create(sessionId, workflowId, browserConfig);
  }

  private createWorkflowAggregate(workflow: Workflow, plan: Plan): Result<WorkflowAggregate> {
    const sessionResult = this.createSession(workflow.getId());
    if (sessionResult.isFailure()) {
      return Result.fail(`Failed to create session: ${sessionResult.getError()}`);
    }

    const aggregateResult = WorkflowAggregate.create(
      workflow,
      plan,
      sessionResult.getValue()
    );
    
    if (aggregateResult.isFailure()) {
      return Result.fail(`Failed to create workflow aggregate: ${aggregateResult.getError()}`);
    }

    return aggregateResult;
  }

  private createExecutionAggregate(): Result<ExecutionAggregate> {
    if (!this.workflow) {
      return Result.fail('Workflow must exist before creating execution aggregate');
    }

    // Create execution context
    const sessionId = SessionId.generate();
    const viewport = Viewport.create(1920, 1080).getValue();
    const contextResult = ExecutionContext.create(
      sessionId,
      this.workflow.getId(),
      this.workflow.startUrl,
      viewport
    );
    
    if (contextResult.isFailure()) {
      return Result.fail(`Failed to create execution context: ${contextResult.getError()}`);
    }

    const aggregateResult = ExecutionAggregate.create(contextResult.getValue());
    if (aggregateResult.isFailure()) {
      return Result.fail(`Failed to create execution aggregate: ${aggregateResult.getError()}`);
    }

    const executionAggregate = aggregateResult.getValue();
    executionAggregate.setStateManager(this.stateManager);

    return Result.ok(executionAggregate);
  }

  async executeWorkflow(goal: string, startUrl?: string): Promise<WorkflowResult> {
    this.startTime = new Date();
    this.currentGoal = goal;
    this.reporter.log(`🚀 Starting workflow: ${goal}`);
    
    try {
      const initialUrl = startUrl || '';
      
      const variables: Variable[] = [];
      
      const workflowResult = this.createWorkflow(goal, initialUrl, variables);
      if (workflowResult.isFailure()) {
        throw new Error(`Failed to create workflow: ${workflowResult.getError()}`);
      }
      this.workflow = workflowResult.getValue();
      
      await this.workflowRepository.save(this.workflow);
      this.reporter.log(`💾 Workflow saved to repository: ${this.workflow.getId().toString()}`);
      
      await this.browser.launch(initialUrl);
      this.reporter.log(`🌐 Browser launched at: ${initialUrl}`);
      this.emitWorkflowEvent('workflow:started', { goal });
      
      const currentUrl = this.browser.getPageUrl();
      let newPlan: Plan;
      
      const planResult = await this.createPlanWithDomainService(goal, currentUrl);
      if (planResult.isFailure()) {
        throw new Error(`Domain planning failed: ${planResult.getError()}`);
      }
      newPlan = planResult.getValue();
      this.reporter.log(`📋 Domain service created plan with ${newPlan.getSteps().length} steps`);
      
      await this.planRepository.save(newPlan);
      this.reporter.log(`💾 Plan saved to repository: ${newPlan.getId().toString()}`);
      
      const aggregateResult = this.createWorkflowAggregate(this.workflow, newPlan);
      if (aggregateResult.isFailure()) {
        throw new Error(`Failed to create workflow aggregate: ${aggregateResult.getError()}`);
      }
      
      this.currentPlan = newPlan;
      
      const executionAggregateResult = this.createExecutionAggregate();
      if (executionAggregateResult.isFailure()) {
        throw new Error(`Failed to create execution aggregate: ${executionAggregateResult.getError()}`);
      }

      this.executionAggregate = executionAggregateResult.getValue();
      
      this.workflowAggregate = aggregateResult.getValue();
      const startResult = this.workflowAggregate.startExecution();
      if (startResult.isFailure()) {
        throw new Error(`Failed to start workflow execution: ${startResult.getError()}`);
      }

      this.currentStrategy = {
        id: `domain-strategy-${Date.now()}`,
        goal,
        steps: newPlan.getSteps().map((step, index) => ({
          id: step.getId().toString(),
          name: step.getDescription(),
          description: step.getDescription(),
          intent: 'interact' as const,
          targetConcept: step.getDescription(),
          priority: index + 1,
          confidence: step.getConfidence().getValue(),
          expectedOutcome: step.getDescription(),
          dependencies: [],
          maxAttempts: 3
        })),
        createdAt: new Date(),
        currentStepIndex: 0
      };
      this.reporter.log(`📋 Strategic plan created with ${this.currentPlan.getSteps().length} steps`);
      
      this.reporter.log(`📊 Using direct WorkflowAggregate execution (TaskQueue removed)`);
      
      const successfullyCompletedSteps: StrategicTask[] = [];
      
      // Simplified execution loop using WorkflowAggregate methods
      let loopCounter = 0;
      const maxLoopIterations = 1000; // Safeguard against infinite loops
      
      while (true) {
        // Infinite loop protection
        loopCounter++;
        if (loopCounter > maxLoopIterations) {
          this.reporter.log(`🛑 Loop limit exceeded (${maxLoopIterations}), breaking to prevent infinite loop`);
          break;
        }
        // Get next step from workflow aggregate (without execution)
        const stepResult = await this.workflowAggregate!.getNextStep();
        if (stepResult.isFailure()) {
          this.reporter.log(`No more steps to execute: ${stepResult.getError()}`);
          break;
        }
        
        const currentStep = stepResult.getValue();
        this.reporter.log(`⚡ Executing step: ${currentStep.getDescription()}`);
        
        // Mark step as started
        const stepStartResult = currentStep.start();
        if (stepStartResult.isFailure()) {
          this.reporter.log(`Failed to start step: ${stepStartResult.getError()}`);
          continue;
        }
        
        const tasks = currentStep.getTasks();
        const stepTaskResults: any[] = [];
        
        for (const task of tasks) {
          // Reset execution context if needed
          if (this.executionAggregate) {
            const context = this.executionAggregate.getContext();
            if (context.getCurrentTaskId()) {
              this.executionAggregate.getContext().forceResetExecution();
            }
          }
          
          // Start task execution
          const startExecutionResult = this.executionAggregate!.startTaskExecution(task);
          if (startExecutionResult.isFailure()) {
            this.reporter.log(`Failed to start task: ${startExecutionResult.getError()}`);
            
            // Create failure result
            const failureResult = {
              taskId: task.getId().toString(),
              success: false,
              error: startExecutionResult.getError(),
              timestamp: new Date()
            };
            stepTaskResults.push(failureResult);
            continue;
          }
          
          this.reporter.log(`⚡ Executing task: ${task.getDescription()}`);
          const taskStartTime = Date.now();
          
          try {
            // Build execution context for real execution service
            const executionContext = await this.buildExecutionContext(task);
            const executionResult = await this.executionService.executeTask(task, executionContext);
            
            let taskResult: any;
            if (executionResult.isSuccess()) {
              const result = executionResult.getValue();
              
              // Evaluate the result
              const evaluationResult = await this.evaluationService.evaluateTaskCompletion(
                task,
                result.evidence,
                this.buildEvaluationContext()
              );
              
              taskResult = {
                taskId: task.getId().toString(),
                success: evaluationResult.isSuccess(),
                duration: Date.now() - taskStartTime,
                data: result.evidence ? result.evidence.map(e => e.getData()) : [],
                timestamp: new Date(),
                ...(evaluationResult.isFailure() && { error: evaluationResult.getError() })
              };
            } else {
              taskResult = {
                taskId: task.getId().toString(),
                success: false,
                error: executionResult.getError(),
                timestamp: new Date()
              };
            }
            
            // Record in execution aggregate
            const evidence = taskResult.data ? 
              Evidence.create(
                'screenshot',
                JSON.stringify({ extractedData: taskResult.data }),
                { source: 'domain-service-execution', description: 'Domain service task execution' }
              ).getValue() : undefined;
            
            const recordResult = await this.executionAggregate!.recordExecution(
              task,
              taskResult,
              evidence,
              `Step: ${currentStep.getDescription()}`
            );
            
            if (recordResult.isFailure()) {
              this.reporter.log(`Failed to record execution: ${recordResult.getError()}`);
            }
            
            // Update task state in workflow aggregate
            if (taskResult.success) {
              task.complete(taskResult);
              this.workflowAggregate!.recordTaskCompletion(task.getId(), taskResult);
              
              // Create strategic task for legacy tracking
              const strategicTask = {
                id: task.getId().toString(),
                name: task.getDescription(),
                description: task.getDescription(),
                intent: 'interact' as const,
                targetConcept: 'page element',
                inputData: null,
                expectedOutcome: task.getDescription(),
                dependencies: [],
                maxAttempts: task.getMaxRetries() + 1,
                priority: 1
              };
              successfullyCompletedSteps.push(strategicTask);
              this.reporter.log(`✅ Task completed: ${task.getDescription()}`);
              
              // Update execution context URL
              try {
                const currentUrlString = this.browser.getPageUrl();
                const urlResult = Url.create(currentUrlString);
                if (urlResult.isSuccess()) {
                  this.executionAggregate!.updateCurrentUrl(urlResult.getValue());
                }
              } catch (error) {
                this.reporter.log(`Warning: Failed to update execution context: ${error}`);
              }
            } else {
              task.fail(new Error(taskResult.error || 'Task execution failed'));
              
              // Handle retry
              if (task.canRetry()) {
                this.reporter.log(`🔄 Retrying task ${task.getRetryCount()}/${task.getMaxRetries()}`);
                const retryResult = task.retry();
                if (retryResult.isSuccess()) {
                  // Note: Task will be retried in the next workflow step iteration
                  // since tasks array is readonly, we can't modify it here
                  this.reporter.log(`🔄 Task marked for retry: ${task.getDescription()}`);
                }
              }
            }
            
            stepTaskResults.push(taskResult);
            
            // Check for early exit conditions
            if (taskResult.success) {
              if (this.config.enableReplanning) {
                const replanRequired = await this.checkForReplanning();
                if (replanRequired) {
                  this.reporter.log(`🔄 Replanning executed after successful task due to significant state changes`);
                  break;
                }
              }
              
              if (this.config.allowEarlyExit) {
                const completion = this.calculateCompletionPercentage();
                const criticalStepsComplete = this.checkCriticalSteps();
                
                if (completion >= (this.config.minAcceptableCompletion || 60) && criticalStepsComplete) {
                  this.reporter.log(`✅ Achieved ${completion.toFixed(1)}% completion with critical steps done. Exiting with partial success.`);
                  await this.publishEntityEvents();
                  return await this.buildWorkflowResult();
                }
              }
            }
            
          } catch (error) {
            const errorResult = {
              taskId: task.getId().toString(),
              success: false,
              error: error instanceof Error ? error.message : String(error),
              timestamp: new Date()
            };
            stepTaskResults.push(errorResult);
            task.fail(error instanceof Error ? error : new Error(String(error)));
            
            // Record failure for memory service
            const beforeState = await this.captureSemanticState();
            const context: MemoryContext = {
              url: this.browser.getPageUrl(),
              taskGoal: task.getDescription(),
              pageSection: beforeState.visibleSections[0]
            };
            
            this.memoryService.addLearning(
              context,
              `Task "${task.getDescription()}" failed: ${error}`,
              {
                actionToAvoid: task.getDescription(),
                alternativeAction: 'Try different approach or selector',
                confidence: 0.8
              }
            );
          }
        }
        
        // Complete step with actual results
        const stepSuccess = stepTaskResults.every(r => r.success);
        const completeStepResult = this.workflowAggregate!.completeStep(
          currentStep.getId(),
          stepTaskResults
        );
        
        if (completeStepResult.isFailure()) {
          this.reporter.log(`Failed to complete step: ${completeStepResult.getError()}`);
        }
        
        this.reporter.log(`✅ Step completed: ${currentStep.getDescription()} (Success: ${stepSuccess})`);
        
        // Check if workflow is complete
        const status = this.workflowAggregate!.getExecutionStatus();
        if (status.completionPercentage >= 100) {
          this.reporter.log('🎉 Workflow completed successfully');
          break;
        }
        
        // Handle step completion results
        if (stepSuccess) {
          // Step succeeded - advance to next step
          const advanceResult = this.workflowAggregate!.advanceToNextStep();
          if (advanceResult.isFailure()) {
            this.reporter.log(`Cannot advance: ${advanceResult.getError()}`);
            break;
          }
        } else {
          // Step failed - WorkflowAggregate.completeStep() already handled retry logic
          this.reporter.log(`❌ Step failed: ${currentStep.getDescription()}`);
          
          // Check current step state after completeStep processing
          const stepAfterProcessing = this.workflowAggregate!.getNextStep();
          if (stepAfterProcessing.isSuccess()) {
            const step = stepAfterProcessing.getValue();
            
            if (step.getId().equals(currentStep.getId())) {
              // Same step - it was reset for retry
              if (step.isPending()) {
                this.reporter.log(`🔄 Step reset for retry: ${step.getDescription()} (${step.getRetryCount()}/${step.getMaxRetries()})`);
                // Continue loop to retry the step
                continue;
              } else if (step.isFailed() && !step.canRetry()) {
                this.reporter.log(`💀 Step permanently failed: ${step.getDescription()} (max retries exceeded)`);
                // Try to advance to next step
                const advanceResult = this.workflowAggregate!.advanceToNextStep();
                if (advanceResult.isFailure()) {
                  this.reporter.log(`Cannot advance from permanently failed step: ${advanceResult.getError()}`);
                  break;
                }
              }
            } else {
              // Different step - WorkflowAggregate advanced to next step automatically
              this.reporter.log(`➡️ Advanced to next step after failure: ${step.getDescription()}`);
            }
          } else {
            // No more steps available
            this.reporter.log(`No more steps available: ${stepAfterProcessing.getError()}`);
            break;
          }
          
          // Optional: Handle replanning for complex failure scenarios
          if (this.config.enableReplanning) {
            const replanRequired = await this.checkForReplanning();
            if (replanRequired) {
              this.reporter.log(`🔄 Replanning triggered due to step failure`);
            }
          }
        }
      }
      
      if (this.workflowAggregate) {
        const status = this.workflowAggregate.getExecutionStatus();
        if (status.completionPercentage >= 100) {
          const completionResult = this.workflowAggregate.completeExecution(
            'Workflow completed successfully',
            this.stateManager.getAllExtractedData()
          );
          
          if (completionResult.isSuccess()) {
            this.reporter.log('✅ Workflow completed successfully');
            
            await this.workflowRepository.update(this.workflow!);
            this.reporter.log(`💾 Completed workflow updated in repository: ${this.workflow!.getId().toString()}`);
          } else {
            this.reporter.log(`⚠️ Failed to mark workflow as complete: ${completionResult.getError()}`);
          }
        } else {
          // Check for partial success criteria before marking as complete failure
          const successfulSteps = successfullyCompletedSteps.length;
          const totalSteps = this.currentPlan?.getSteps().length || 0;
          const partialCompletionPercentage = totalSteps > 0 ? (successfulSteps / totalSteps) * 100 : 0;
          
          if (partialCompletionPercentage >= 50 || successfulSteps >= 2) {
            // Consider this a partial success rather than complete failure
            this.reporter.log(`⚠️ Workflow partially completed: ${successfulSteps}/${totalSteps} steps (${partialCompletionPercentage.toFixed(1)}%)`);
            
            const partialCompletionResult = this.workflowAggregate.completeExecution(
              `Workflow partially completed: ${successfulSteps}/${totalSteps} steps completed`,
              this.stateManager.getAllExtractedData()
            );
            
            if (partialCompletionResult.isFailure()) {
              this.reporter.log(`⚠️ Failed to mark workflow as partially complete: ${partialCompletionResult.getError()}`);
            }
          } else {
            // Mark as failed if very little progress was made
            this.workflowAggregate.failExecution(`Workflow execution stopped with minimal progress: ${successfulSteps}/${totalSteps} steps completed`);
          }
          
          await this.workflowRepository.update(this.workflow!);
          this.reporter.log(`💾 Workflow updated in repository: ${this.workflow!.getId().toString()}`);
        }
      }
      
      this.reporter.log(`📊 Workflow execution completed using direct aggregate approach`);
      
      await this.publishEntityEvents();
      return await this.buildWorkflowResult();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emitWorkflowEvent('workflow:error', { error: errorMessage });
      throw error;
    } finally {
      await this.cleanup();
    }
  }


  private async captureSemanticState(): Promise<PageState> {
    return await this.stateManager.captureState();
  }

  private async checkForReplanning(): Promise<boolean> {
    if (!this.stateManager) return false;
    
    const currentState = this.stateManager.getCurrentState();
    const previousState = this.stateManager.getPreviousState();
    
    if (!currentState || !previousState) return false;
    
    if (this.stateManager.hasStateChanged(previousState, currentState)) {
      const changes = this.analyzeStateChanges(previousState, currentState);
      
      if (changes.requiresReplanning) {
        this.reporter.log('🔄 Significant state change detected, triggering replanning');
        
        // Create checkpoint before replanning
        this.stateManager.createCheckpoint('before-replan');
        const newPlan = await this.replanWithStateContext(currentState);
        
        if (newPlan) {
          this.currentPlan = newPlan;
          this.eventBus.emit('replan:triggered', {
            reason: changes.reason,
            newPlanSize: newPlan.getSteps().length
          });
          return true;
        }
      }
    }
    
    return false;
  }

  private analyzeStateChanges(prev: PageState, curr: PageState): StateChangeAnalysis {
    const prevSections = new Set(prev.visibleSections);
    const currSections = new Set(curr.visibleSections);
    const prevActions = new Set(prev.availableActions);
    const currActions = new Set(curr.availableActions);
    
    const sectionChanges = this.calculateSetDifference(prevSections, currSections);
    const actionChanges = this.calculateSetDifference(prevActions, currActions);
    
    return {
      requiresReplanning: sectionChanges > 0.5 || actionChanges > 0.5,
      reason: `Sections changed ${(sectionChanges * 100).toFixed(0)}%, Actions changed ${(actionChanges * 100).toFixed(0)}%`
    };
  }

  private calculateSetDifference(set1: Set<string>, set2: Set<string>): number {
    const union = new Set([...set1, ...set2]);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    
    if (union.size === 0) return 0;
    return 1 - (intersection.size / union.size);
  }

  private async replanWithStateContext(currentState: PageState): Promise<Plan | null> {
    try {
      // Extract context from current state
      const stateContext = {
        currentUrl: currentState.url,
        availableActions: currentState.availableActions,
        visibleSections: currentState.visibleSections,
        extractedData: this.stateManager.getAllExtractedData(),
        checkpoints: this.stateManager.getCheckpointNames()
      };

      // Use domain planning service for replanning
      const planningContext: PlanningContext = {
        goal: this.currentGoal,
        url: stateContext.currentUrl,
        existingPageState: (currentState as any).pageContent,
        previousAttempts: [], // Could be populated from memory service
        availableActions: stateContext.availableActions,
        userInstructions: this.currentGoal,
        timeConstraints: this.config.timeout || 300000
      };
      
      if (this.workflow) {
        planningContext.workflowId = this.workflow.getId();
      }

      const planResult = await this.planningService.createPlan(this.currentGoal, planningContext);
      if (planResult.isSuccess()) {
        const plan = planResult.getValue();
        this.reporter.log(`📋 Domain service created new plan with ${plan.getSteps().length} steps based on current state`);
        return plan;
      } else {
        this.reporter.log(`❌ Failed to replan with domain service: ${planResult.getError()}`);
      }
    } catch (error) {
      this.reporter.log(`❌ Failed to replan with state context: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return null;
  }

  private async buildWorkflowResult(): Promise<WorkflowResult> {
    const endTime = new Date();
    const duration = this.startTime ? endTime.getTime() - this.startTime.getTime() : 0;
    
    let completionPercentage = 0;
    let workflowStatus: WorkflowResult['status'] = 'failure';
    let workflowId = `workflow-${Date.now()}`;
    let workflowGoal = '';
    let executionStats: any = {};
    
    if (this.workflowAggregate && this.executionAggregate) {
      // Use aggregate data
      const workflow = this.workflowAggregate.getWorkflow();
      const executionStatus = this.workflowAggregate.getExecutionStatus();
      const executionStatistics = this.executionAggregate.getExecutionStatistics();
      
      workflowId = workflow.getId().toString();
      workflowGoal = workflow.goal;
      completionPercentage = executionStatus.completionPercentage;
      executionStats = executionStatistics;
      
      // Determine status from workflow aggregate
      if (workflow.isComplete()) {
        workflowStatus = 'success';
      } else if (workflow.isFailed()) {
        workflowStatus = 'failure';
      } else if (completionPercentage >= 70) {
        workflowStatus = 'partial';
      } else if (completionPercentage >= 40) {
        workflowStatus = 'degraded';
      }
      
      this.reporter.log(`📊 Execution statistics: ${JSON.stringify(executionStats)}`);
      
    } else if (this.workflow && this.currentPlan) {
      // Fallback to entity data
      workflowId = this.workflow.getId().toString();
      workflowGoal = this.workflow.goal;
      completionPercentage = this.currentPlan.getProgress() * 100;
      
      // Determine status from workflow entity
      if (this.workflow.isComplete()) {
        workflowStatus = 'success';
      } else if (this.workflow.isFailed()) {
        workflowStatus = 'failure';
      } else if (completionPercentage >= 70) {
        workflowStatus = 'partial';
      } else if (completionPercentage >= 40) {
        workflowStatus = 'degraded';
      }
    } else {
      // Fallback to legacy calculation
      const totalSteps = this.currentStrategy?.steps.length || 0;
      const completedCount = Array.from(this.completedSteps.values())
        .filter(r => r.success || r.status === 'partial').length;
      completionPercentage = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;
      
      if (completionPercentage === 100) {
        workflowStatus = 'success';
      } else if (completionPercentage >= 70) {
        workflowStatus = 'partial';
      } else if (completionPercentage >= 40) {
        workflowStatus = 'degraded';
      }
      
      workflowGoal = this.currentStrategy?.goal || '';
    }
    
    // Get all accumulated data
    const allExtractedData = this.stateManager.getAllExtractedData();
    
    // Base result object with aggregate data
    const baseResult = {
      id: workflowId,
      goal: workflowGoal,
      status: workflowStatus,
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
      summary: `Workflow completed with ${completionPercentage.toFixed(1)}% progress`,
      errors: this.errors,
      executionStatistics: executionStats,
      aggregateMetrics: this.workflowAggregate ? {
        workflowStatus: this.workflowAggregate.getExecutionStatus().workflowStatus,
        sessionStatus: this.workflowAggregate.getExecutionStatus().sessionStatus,
        isHealthy: this.workflowAggregate.getExecutionStatus().isHealthy,
        totalSteps: this.workflowAggregate.getExecutionStatus().totalSteps,
        currentStepIndex: this.workflowAggregate.getExecutionStatus().currentStepIndex
      } : undefined,
      // Progressive completion fields
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

  private async publishEntityEvents(): Promise<void> {
    const allEvents: DomainEvent[] = [];

    // Collect events from workflow
    if (this.workflow) {
      allEvents.push(...this.workflow.getDomainEvents());
      this.workflow.clearDomainEvents();
    }

    // Collect events from current plan
    if (this.currentPlan) {
      allEvents.push(...this.currentPlan.getDomainEvents());
      this.currentPlan.clearDomainEvents();

      // Collect events from all steps and tasks
      const steps = this.currentPlan.getSteps();
      for (const step of steps) {
        allEvents.push(...step.getDomainEvents());
        step.clearDomainEvents();

        const tasks = step.getTasks();
        for (const task of tasks) {
          allEvents.push(...task.getDomainEvents());
          task.clearDomainEvents();
        }
      }
    }

    // Collect events from workflow and execution aggregates
    if (this.workflowAggregate) {
      allEvents.push(...this.workflowAggregate.getDomainEvents());
      this.workflowAggregate.clearDomainEvents();
    }

    if (this.executionAggregate) {
      allEvents.push(...this.executionAggregate.getDomainEvents());
      this.executionAggregate.clearDomainEvents();
    }

    // Publish and store all events
    if (allEvents.length > 0) {
      // Store events in event store for persistence and replay
      await this.eventStore.storeMany(allEvents, { 
        workflowId: this.workflow?.getId()?.toString(),
        publishedAt: new Date().toISOString()
      });
      
      // Publish events to handlers
      await this.workflowEventBus.publishDomainEvents(allEvents);
      this.reporter.log(`📡 Published and stored ${allEvents.length} domain events`);
    }
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.reporter.log('🛑 Browser closed');
    }
  }

  private async buildExecutionContext(_task: any): Promise<any> {
    const currentState = await this.captureSemanticState();
    const currentUrlObj = Url.create(this.browser.getPageUrl()).getValue();
    const viewport = Viewport.create(1920, 1080).getValue();
    
    const domainPageState = PageStateVO.create({
      url: currentUrlObj,
      title: currentState.title || 'Current Page', 
      html: '',
      elements: [],
      loadTime: 0
    });
    
    return {
      currentUrl: currentUrlObj,
      viewport: viewport,
      pageState: domainPageState,
      availableActions: currentState.availableActions,
      previousActions: []
    };
  }

  private buildEvaluationContext(): any {
    const currentUrlObj = Url.create(this.browser.getPageUrl()).getValue();
    
    return {
      originalGoal: this.currentGoal,
      currentUrl: currentUrlObj,
      pageState: null, // Will be set by caller if needed
      workflowId: this.workflow?.getId(),
      executionContext: this.executionAggregate?.getContext(),
      timeConstraints: 30000
    };
  }

  /**
   * Creates a plan using the domain planning service
   */
  private async createPlanWithDomainService(goal: string, currentUrl: string): Promise<Result<Plan>> {
    try {
      const currentState = await this.captureSemanticState();
      
      const planningContext: PlanningContext = {
        goal,
        url: currentUrl,
        existingPageState: (currentState as any).pageContent,
        previousAttempts: [], // Could be populated from memory service
        availableActions: ['click', 'type', 'navigate', 'extract', 'wait'],
        userInstructions: goal,
        timeConstraints: this.config.timeout || 300000
      };
      
      if (this.workflow) {
        planningContext.workflowId = this.workflow.getId();
      }

      const planResult = await this.planningService.createPlan(goal, planningContext);
      if (planResult.isFailure()) {
        this.reporter.log(`❌ Domain planning failed: ${planResult.getError()}`);
        return planResult;
      }

      const plan = planResult.getValue();
      this.reporter.log(`✅ Domain service created plan with ${plan.getSteps().length} steps`);
      
      return Result.ok(plan);
    } catch (error) {
      return Result.fail(`Domain planning error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get current workflow metrics from the metrics handler
   */
  getWorkflowMetrics() {
    return this.metricsHandler.getMetrics();
  }

  /**
   * Get detailed workflow statistics
   */
  getWorkflowStatistics() {
    return this.metricsHandler.getDetailedStats();
  }

  /**
   * Export metrics data as JSON
   */
  exportMetrics(): string {
    return this.metricsHandler.exportMetrics();
  }

  /**
   * Get task failure statistics
   */
  getTaskFailureStatistics() {
    return this.taskFailureHandler.getRetryStatistics();
  }

  /**
   * Get workflow health statistics
   */
  getWorkflowHealthStatistics() {
    return this.workflowStuckHandler.getHealthStatistics();
  }

  /**
   * Get event store statistics
   */
  async getEventStoreStatistics() {
    return await this.eventStore.getStats();
  }

  /**
   * Get events for a specific aggregate (useful for debugging)
   */
  async getEventsForAggregate(aggregateId: string) {
    return await this.eventStore.getEventsForAggregate(aggregateId);
  }

  /**
   * Get recent events (useful for monitoring)
   */
  async getRecentEvents(limit: number = 50) {
    return await this.eventStore.getLatestEvents(limit);
  }

  /**
   * Export all events as JSON
   */
  exportEvents(): string {
    return (this.eventStore as InMemoryEventStore).exportToJson();
  }

  /**
   * Get event timeline for debugging
   */
  async getEventTimeline(aggregateId?: string) {
    return await (this.eventStore as InMemoryEventStore).getEventTimeline(aggregateId);
  }

  /**
   * Get saga statistics
   */
  getSagaStatistics() {
    return this.workflowSaga.getSagaStatistics();
  }

  /**
   * Get active sagas
   */
  getActiveSagas() {
    return this.workflowSaga.getActiveSagas();
  }

  /**
   * Get saga for current workflow
   */
  getCurrentWorkflowSaga() {
    if (this.workflow) {
      return this.workflowSaga.getSagaForWorkflow(this.workflow.getId().toString());
    }
    return undefined;
  }

  /**
   * TaskQueue event listeners removed - using direct WorkflowAggregate execution
   */
  
  /**
   * Setup StateManager event listeners for monitoring integration
   */
  private setupStateManagerEventListeners(): void {
    this.stateManager.on('state:captured', (data: any) => {
      this.reporter.log(`📸 State captured: ${data.url} (Sections: ${data.sectionsCount}, Actions: ${data.actionsCount})`);
      this.eventBus.emit('state:captured', data);
    });

    this.stateManager.on('checkpoint:created', (data: any) => {
      this.reporter.log(`💾 Checkpoint created: ${data.name} (Total: ${data.checkpointCount})`);
      this.eventBus.emit('state:checkpoint', data);
    });

    this.stateManager.on('data:extracted', (data: any) => {
      this.reporter.log(`📊 Data extracted: ${data.keys.join(', ')} (${data.itemCount} items)`);
      this.eventBus.emit('state:data-extracted', data);
    });
  }
  
  /**
   * Connect domain events to WorkflowMonitor through EventBus bridge
   */
  private connectDomainEventsToMonitor(): void {
    if (this.workflow) {
      // Note: In a full implementation, these would be set up when domain events are emitted
      // For now, we'll set up the basic infrastructure for bridging domain events to the event bus
      
      // This is a placeholder that demonstrates how domain events would be bridged
      // In a full implementation, the workflow entities would emit domain events
      // and we would listen to them here to bridge them to the system event bus
      this.reporter.log('🔗 Domain event monitoring bridge configured');
      
      // Example of how domain events would be bridged:
      // this.workflowEventBus.on('WorkflowStartedEvent', (event: WorkflowStartedEvent) => {
      //   this.eventBus.emit('workflow:started', {
      //     goal: event.goal,
      //     workflowId: event.workflowId.toString(),
      //     timestamp: event.occurredAt
      //   });
      // });
      
      // this.workflowEventBus.on('TaskCompletedEvent', (event: TaskCompletedEvent) => {
      //   this.eventBus.emit('task:completed', {
      //     taskId: event.taskId.toString(),
      //     result: event.result,
      //     timestamp: event.occurredAt
      //   });
      // });
    }
  }
}