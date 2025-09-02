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
} from '../types/agent-types';
import { ITaskSummarizer, SummarizerInput } from '../interfaces/agent.interface';
import { EnhancedEventBusInterface } from '../interfaces/event-bus.interface';
import { Browser } from '../interfaces/browser.interface';
import { DomService } from '@/infra/services/dom-service';
import { AgentReporter } from '../interfaces/agent-reporter.interface';
import { StateManager } from './state-manager';
import { TaskQueue } from './task-queue';
import { MemoryService, MemoryContext } from './memory-service';
import { VariableManager } from './variable-manager';
import { truncateExtractedData } from '../shared/utils';
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
  Step,
  Task,
  Result,
  Session,
  ExecutionContext
} from '../entities';
import {
  WorkflowId,
  PlanId,
  StepId,
  TaskId,
  Variable,
  Url,
  Confidence,
  Priority,
  Intent,
  SessionId,
  Viewport,
  PageState as PageStateVO,
  Evidence
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
  maxReplansPerStep?: number;      // Max replans per individual step
  maxTotalReplans?: number;         // Max replans for entire workflow
  enableDegradation?: boolean;      // Allow degraded success
  allowEarlyExit?: boolean;           // Can workflow exit with partial results?
  minAcceptableCompletion?: number;   // Minimum % completion to exit early (default 60)
  criticalSteps?: string[];           // Step IDs that must complete
  taskQueue?: any; // TaskQueue type
  enableQueueIntegration?: boolean;
  stateManager?: StateManager;
  enableStateIntegration?: boolean;
  workflowMonitor?: any; // WorkflowMonitor type
  enableMonitorIntegration?: boolean;
  planningService?: PlanningService;
  executionService?: ExecutionService;
  evaluationService?: EvaluationService;
  workflowRepository?: WorkflowRepository;
  planRepository?: PlanRepository;
  memoryRepository?: MemoryRepository;
}

interface StateChangeAnalysis {
  requiresReplanning: boolean;
  reason: string;
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
  private workflowAggregate: WorkflowAggregate | null = null;
  private executionAggregate: ExecutionAggregate | null = null;
  
  private taskQueue: TaskQueue;
  
  private workflow: Workflow | null = null;
  private currentPlan: Plan | null = null;
  private currentGoal: string = '';
  private currentStrategy: StrategicPlan | null = null;
  private completedSteps: Map<string, StepResult> = new Map();
  private startTime: Date | null = null;
  private extractedData: any = {};
  private stateManager: StateManager;
  private memoryService: MemoryService;
  private variableManager: VariableManager;
  private summarizer?: ITaskSummarizer;
  private errors: string[] = [];
  
  private planningService: PlanningService | undefined;
  // TODO: Future enhancement - integrate execution service for task execution
  // private executionService: ExecutionService | undefined;
  // TODO: Future enhancement - integrate evaluation service for result evaluation  
  // private evaluationService: EvaluationService | undefined;

  private workflowRepository: WorkflowRepository | undefined;
  private planRepository: PlanRepository | undefined;
  // TODO: Future enhancement - integrate memory repository with MemoryService
  // private memoryRepository: MemoryRepository | undefined;

  private workflowEventBus: WorkflowEventBus;
  private metricsHandler: WorkflowMetricsHandler;
  private loggingHandler: WorkflowLoggingHandler;
  private taskFailureHandler: TaskFailureHandler;
  private workflowStuckHandler: WorkflowStuckHandler;
  private eventStore: IEventStore;
  private workflowSaga: WorkflowSaga;
  
  // private replanAttemptsPerStep: Map<string, number> = new Map();
  // private failedApproaches: Map<string, string[]> = new Map();
  // private maxReplansPerStep: number = 3; // Configurable limit

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
      maxReplansPerStep: 3, // TODO: Remove in Phase 4
      enableDegradation: true,
      allowEarlyExit: false,  // Opt-in for early exit
      minAcceptableCompletion: 60,
      criticalSteps: [],
      ...config
    };
    // this.maxReplansPerStep = this.config.maxReplansPerStep || 3;
    
    this.taskQueue = config.taskQueue || new TaskQueue();
    this.stateManager = new StateManager(browser, domService);
    this.memoryService = new MemoryService(this.eventBus);
    this.variableManager = config.variableManager || new VariableManager();
    if (config.summarizer) {
      this.summarizer = config.summarizer;
    }
    
    // Setup TaskQueue event listeners for enhanced monitoring
    if (config.enableQueueIntegration !== false) {
      this.setupTaskQueueEventListeners();
    }
    
    if (config.enableStateIntegration !== false) {
      this.setupStateManagerEventListeners();
    }
    
    if (config.enableMonitorIntegration !== false) {
      this.connectDomainEventsToMonitor();
    }
    
    this.planningService = config.planningService;
    // TODO: Future enhancement - uncomment when implementing execution/evaluation services
    // this.executionService = config.executionService;
    // this.evaluationService = config.evaluationService;
    
    this.workflowRepository = config.workflowRepository;
    this.planRepository = config.planRepository;
    // TODO: Future enhancement - uncomment when integrating memory repository
    // this.memoryRepository = config.memoryRepository;

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

  // Factory method to create workflow entity
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

  // Factory method to create session entity
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
    // Create session entity
    const sessionResult = this.createSession(workflow.getId());
    
    if (sessionResult.isFailure()) {
      return Result.fail(`Failed to create session: ${sessionResult.getError()}`);
    }

    // Create workflow aggregate with TaskQueue integration
    const aggregateResult = WorkflowAggregate.create(
      workflow,
      plan,
      sessionResult.getValue(),
      this.taskQueue,  // Pass TaskQueue instance
      this.reporter    // Pass reporter for logging
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
    if (this.config.enableStateIntegration !== false) {
      executionAggregate.setStateManager(this.stateManager);
    }

    return Result.ok(executionAggregate);
  }

  private convertToPlanEntity(plannerOutput: any): Result<Plan> {
    if (!this.workflow) {
      return Result.fail('Workflow must be created before plan');
    }

    // Defensive check: Ensure planner output has strategy array
    if (!plannerOutput || !plannerOutput.strategy || !Array.isArray(plannerOutput.strategy)) {
      return Result.fail('Planner output must contain a valid strategy array');
    }

    // Defensive check: Ensure strategy has at least one step
    if (plannerOutput.strategy.length === 0) {
      return Result.fail('Planner strategy must contain at least one step');
    }

    this.reporter.log(`🔍 Converting ${plannerOutput.strategy.length} strategic tasks to plan entities`);

    const planId = PlanId.generate();
    const workflowId = this.workflow.getId();
    
    // Convert strategic tasks to Step entities
    const steps: Step[] = [];
    for (let i = 0; i < plannerOutput.strategy.length; i++) {
      const strategicTask = plannerOutput.strategy[i];
      
      // Validate strategic task structure
      if (!strategicTask || typeof strategicTask.description !== 'string' || !strategicTask.description.trim()) {
        return Result.fail(`Strategic task ${i + 1} must have a valid description`);
      }
      
      const stepId = StepId.generate();
      const confidence = Confidence.create(80); // Default confidence
      
      if (!confidence.isSuccess()) {
        return Result.fail(`Failed to create confidence: ${confidence.getError()}`);
      }
      
      const stepResult = Step.create(
        stepId,
        strategicTask.description,
        i + 1, // order
        confidence.getValue()
      );
      
      if (stepResult.isFailure()) {
        return Result.fail(`Failed to create step ${i + 1}: ${stepResult.getError()}`);
      }
      
      const step = stepResult.getValue();
      
      // Convert strategic task to Task entity and add to step
      const taskResult = this.convertStrategicTaskToTaskEntity(strategicTask);
      if (taskResult.isFailure()) {
        return Result.fail(`Failed to convert strategic task to task entity: ${taskResult.getError()}`);
      }
      
      const addTaskResult = step.addTask(taskResult.getValue());
      if (addTaskResult.isFailure()) {
        return Result.fail(`Failed to add task to step: ${addTaskResult.getError()}`);
      }
      
      steps.push(step);
    }
    
    // Create the plan
    return Plan.create(planId, workflowId, steps);
  }

  // Map strategic intent to Task entity intent
  private mapStrategicIntentToTaskIntent(strategicIntent: string): string {
    // Map strategic-level intents to browser-action intents
    const intentMapping: Record<string, string> = {
      'search': 'type',        // Searching involves typing in a search box
      'filter': 'click',       // Filtering involves clicking filter options
      'interact': 'click',     // General interaction is usually clicking
      'authenticate': 'fill',  // Authentication involves filling forms
      'navigate': 'navigate',  // Direct mapping
      'extract': 'extract',    // Direct mapping
      'verify': 'verify'       // Direct mapping
    };
    
    const normalized = strategicIntent.toLowerCase().trim();
    const mappedIntent = intentMapping[normalized] || 'click'; // Default to 'click' for unknown intents
    
    if (intentMapping[normalized]) {
      this.reporter.log(`🔄 Mapped intent: ${strategicIntent} → ${mappedIntent}`);
    } else {
      this.reporter.log(`⚠️ Unknown strategic intent '${strategicIntent}', defaulting to 'click'`);
    }
    
    return mappedIntent;
  }

  // Convert a StrategicTask to a Task entity
  private convertStrategicTaskToTaskEntity(strategicTask: StrategicTask): Result<Task> {
    const taskId = TaskId.generate();
    
    // Map strategic intent to Task entity intent
    const mappedIntent = this.mapStrategicIntentToTaskIntent(strategicTask.intent);
    
    // Create Intent value object with mapped intent
    const intent = Intent.create(mappedIntent);
    if (!intent.isSuccess()) {
      return Result.fail(`Invalid intent: ${intent.getError()}`);
    }
    
    // Create Priority value object based on strategic task priority
    const priority = strategicTask.priority <= 2 ? Priority.high() : 
                    strategicTask.priority <= 4 ? Priority.medium() : 
                    Priority.low();
    
    // Create Task entity
    return Task.create(
      taskId,
      intent.getValue(),
      strategicTask.description,
      priority,
      strategicTask.maxAttempts || 3,
      30000 // 30 second timeout
    );
  }

  // Convert a Task entity back to StrategicTask for legacy compatibility
  private convertTaskToStrategicTask(task: Task, _step: Step): StrategicTask {
    // Map Intent values to StrategicTask intents
    const intentMapping: Record<string, StrategicTask['intent']> = {
      'click': 'interact',
      'fill': 'interact', 
      'type': 'interact',
      'submit': 'interact',
      'select': 'interact',
      'hover': 'interact',
      'scroll': 'interact',
      'extract': 'extract',
      'capture': 'extract',
      'verify': 'verify',
      'navigate': 'navigate',
      'wait': 'interact'
    };
    
    const taskIntent = task.getIntent().getValue();
    const strategicIntent = intentMapping[taskIntent] || 'interact';
    
    return {
      id: task.getId().toString(),
      name: task.getDescription(),
      description: task.getDescription(),
      intent: strategicIntent,
      targetConcept: 'page element', // Default
      inputData: null,
      expectedOutcome: task.getDescription(),
      dependencies: [],
      maxAttempts: task.getMaxRetries() + 1,
      priority: task.getPriority().isHigh() ? 1 : 
                task.getPriority().isMedium() ? 3 : 5
    };
  }

  async executeWorkflow(goal: string, startUrl?: string): Promise<WorkflowResult> {
    this.startTime = new Date();
    this.currentGoal = goal;
    this.reporter.log(`🚀 Starting workflow: ${goal}`);
    
    try {
      const initialUrl = startUrl || 'https://amazon.com';
      
      // Get variables from variable manager as Value Objects
      const variables: Variable[] = []; // TODO: Convert from VariableManager
      
      // Create workflow entity
      const workflowResult = this.createWorkflow(goal, initialUrl, variables);
      if (workflowResult.isFailure()) {
        throw new Error(`Failed to create workflow: ${workflowResult.getError()}`);
      }
      this.workflow = workflowResult.getValue();
      
      if (this.workflowRepository) {
        try {
          await this.workflowRepository.save(this.workflow);
          this.reporter.log(`💾 Workflow saved to repository: ${this.workflow.getId().toString()}`);
        } catch (error) {
          this.reporter.log(`⚠️ Failed to save workflow to repository: ${error}`);
        }
      }
      
      // Initialize browser with start URL
      await this.browser.launch(initialUrl);
      this.reporter.log(`🌐 Browser launched at: ${initialUrl}`);
      
      // Emit workflow started event
      this.emitWorkflowEvent('workflow:started', { goal });
      
      // Get current URL after browser launch
      const currentUrl = this.browser.getPageUrl();
      
      let newPlan: Plan;
      
      if (this.planningService) {
        // Use domain service for planning
        const planResult = await this.createPlanWithDomainService(goal, currentUrl);
        if (planResult.isFailure()) {
          throw new Error(`Domain planning failed: ${planResult.getError()}`);
        }
        newPlan = planResult.getValue();
        this.reporter.log(`📋 Domain service created plan with ${newPlan.getSteps().length} steps`);
      } else {
        // Fallback to legacy planning
        const currentState = await this.captureSemanticState();
        const plannerInput: PlannerInput = {
          goal,
          currentUrl,
          constraints: [],
          currentState // NEW: Include current page state with screenshots
        };
        
        const plannerOutput = await this.planner.execute(plannerInput);
        this.reporter.log(`🔍 Legacy planner output: ${JSON.stringify(sanitizeForLogging(plannerOutput), null, 2)}`);
        
        // Defensive check: Validate planner output before conversion
        if (!plannerOutput) {
          throw new Error('Planner returned null or undefined output');
        }
        
        if (!plannerOutput.strategy || !Array.isArray(plannerOutput.strategy) || plannerOutput.strategy.length === 0) {
          throw new Error('Planner returned empty or invalid strategy. The planner must return at least one strategic step.');
        }
        
        this.reporter.log(`✅ Planner returned ${plannerOutput.strategy.length} strategic steps`);
        
        const planResult = this.convertToPlanEntity(plannerOutput);
        if (planResult.isFailure()) {
          throw new Error(`Failed to create plan: ${planResult.getError()}`);
        }
        newPlan = planResult.getValue();
      }
      
      if (this.planRepository) {
        try {
          await this.planRepository.save(newPlan);
          this.reporter.log(`💾 Plan saved to repository: ${newPlan.getId().toString()}`);
        } catch (error) {
          this.reporter.log(`⚠️ Failed to save plan to repository: ${error}`);
        }
      }
      
      // Now create the workflow aggregate with the valid plan
      const aggregateResult = this.createWorkflowAggregate(this.workflow, newPlan);
      if (aggregateResult.isFailure()) {
        throw new Error(`Failed to create workflow aggregate: ${aggregateResult.getError()}`);
      }
      
      this.workflowAggregate = aggregateResult.getValue();
      this.currentPlan = newPlan;
      
      const executionAggregateResult = this.createExecutionAggregate();
      if (executionAggregateResult.isFailure()) {
        throw new Error(`Failed to create execution aggregate: ${executionAggregateResult.getError()}`);
      }
      
      this.executionAggregate = executionAggregateResult.getValue();
      
      // Start the workflow using aggregate
      const startResult = this.workflowAggregate.startExecution();
      if (startResult.isFailure()) {
        throw new Error(`Failed to start workflow execution: ${startResult.getError()}`);
      }
      
      // Keep legacy strategy for backward compatibility when using legacy planner
      if (!this.planningService) {
        const plannerOutput = await this.planner.execute({
          goal,
          currentUrl,
          constraints: [],
          currentState: await this.captureSemanticState()
        });
        
        this.currentStrategy = {
          id: plannerOutput.id,
          goal: plannerOutput.goal,
          steps: plannerOutput.strategy,
          createdAt: plannerOutput.createdAt,
          currentStepIndex: plannerOutput.currentStepIndex
        };
      } else {
        // Create a minimal strategy for domain service path
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
      }
      this.reporter.log(`📋 Strategic plan created with ${this.currentPlan.getSteps().length} steps`);
      
      this.taskQueue.clear();
      this.reporter.log(`📊 TaskQueue cleared for new workflow execution`);
      
      // Track which steps have been successfully completed
      const successfullyCompletedSteps: StrategicTask[] = [];
      
      // Execute steps using workflow aggregate with queue-based scheduling
      while (true) {
        // Report queue status before step execution
        const readyTasks = this.taskQueue.getReadyTasks();
        const blockedTasks = this.taskQueue.getBlockedTasks();
        this.reporter.log(`📊 Queue Status: ${readyTasks.length} ready, ${blockedTasks.length} blocked, ${this.taskQueue.size()} total`);
        
        // Optimize queue if necessary
        this.taskQueue.optimizeForHighPriority();
        
        // Perform memory cleanup periodically
        if (this.taskQueue.size() % 50 === 0) {
          this.taskQueue.cleanupCompletedTasks();
        }
        
        // CRITICAL: Execute next step using queue - note async call with await
        const stepExecutionResult = await this.workflowAggregate!.executeNextStep();
        if (stepExecutionResult.isFailure()) {
          this.reporter.log(`No more steps to execute: ${stepExecutionResult.getError()}`);
          break;
        }
        
        const stepResult = stepExecutionResult.getValue();
        const currentStep = stepResult.step;
        
        this.reporter.log(`⚡ Executing step: ${currentStep.getDescription()}`);
        
        // Execute each task in the step using ExecutionAggregate
        const tasks = currentStep.getTasks();
        for (const task of tasks) {
          // Start task execution using ExecutionAggregate
          const startExecutionResult = this.executionAggregate!.startTaskExecution(task);
          if (startExecutionResult.isFailure()) {
            this.reporter.log(`Failed to start task execution: ${startExecutionResult.getError()}`);
            continue;
          }
          
          // Execute the task using legacy method for now (Phase 4 will use domain services)
          const strategicTask = this.convertTaskToStrategicTask(task, currentStep);
          const executionResult = await this.executeStrategicStep(strategicTask);
          
          // Create task result
          const taskResult = {
            taskId: task.getId().toString(),
            success: executionResult.success,
            duration: executionResult.duration,
            timestamp: new Date(),
            data: executionResult.evidence?.extractedData,
            ...(executionResult.errorReason && { error: executionResult.errorReason })
          };
          
          // Record execution using ExecutionAggregate
          const evidence = executionResult.evidence ? 
            Evidence.create(
              'screenshot', // Evidence type
              JSON.stringify(executionResult.evidence),
              { source: 'task-execution', description: 'Task execution evidence' }
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
          
          if (executionResult.success) {
            successfullyCompletedSteps.push(strategicTask);
            
            // Update execution context if we have new page state
            if (executionResult.evidence?.afterState) {
              try {
                const currentUrlString = this.browser.getPageUrl();
                const urlResult = Url.create(currentUrlString);
                if (urlResult.isSuccess()) {
                  this.executionAggregate!.updateCurrentUrl(urlResult.getValue());
                  
                  // Update page state in execution context
                  const pageState = PageStateVO.create({
                    url: urlResult.getValue(),
                    title: 'Updated Page State',
                    html: '',
                    elements: [], // Use empty array since visibleElements doesn't exist on PageState
                    loadTime: 0
                  });
                  
                  this.executionAggregate!.updatePageState(pageState);
                }
              } catch (error) {
                // Log but don't fail - context updates are not critical
                this.reporter.log(`Warning: Failed to update execution context: ${error}`);
              }
            }
            
            if (this.config.enableReplanning) {
              const replanRequired = await this.checkForReplanning();
              if (replanRequired) {
                this.reporter.log(`🔄 Replanning executed after successful task due to significant state changes`);
                // Continue execution with new plan - break out of current task loop
                break;
              }
            }
            
            // Check if we should exit early with partial results
            if (this.config.allowEarlyExit) {
              const completion = this.calculateCompletionPercentage();
              const criticalStepsComplete = this.checkCriticalSteps();
              
              if (completion >= (this.config.minAcceptableCompletion || 60) && criticalStepsComplete) {
                this.reporter.log(`✅ Achieved ${completion.toFixed(1)}% completion with critical steps done. Exiting with partial success.`);
                await this.publishEntityEvents();
                return await this.buildWorkflowResult();
              }
            }
          } else {
            // Handle task failure with retry logic
            const beforeState = await this.captureSemanticState();
            const context: MemoryContext = {
              url: this.browser.getPageUrl(),
              taskGoal: strategicTask.description,
              pageSection: beforeState.visibleSections[0]
            };
            
            // Record what failed for future reference
            this.memoryService.addLearning(
              context,
              `Task "${strategicTask.description}" failed: ${executionResult.errorReason}`,
              {
                actionToAvoid: strategicTask.description,
                alternativeAction: 'Try different approach or selector',
                confidence: 0.8
              }
            );
            
            // Check if task can be retried before failing the workflow
            if (task.canRetry()) {
              this.reporter.log(`🔄 Task failed but can retry: ${task.getRetryCount()}/${task.getMaxRetries()} attempts. Retrying...`);
              
              // Mark task for retry
              const retryResult = task.retry();
              if (retryResult.isSuccess()) {
                // Continue the loop to retry this task
                continue;
              } else {
                this.reporter.log(`❌ Failed to mark task for retry: ${retryResult.getError()}`);
              }
            } else {
              this.reporter.log(`⚠️ Task failed and max retries (${task.getMaxRetries()}) reached. Moving to next step...`);
            }
            
            if (this.config.enableReplanning) {
              const replanRequired = await this.checkForReplanning();
              if (replanRequired) {
                this.reporter.log(`🔄 Replanning executed due to task failure and state changes`);
                // Continue execution with new plan
                continue;
              }
            }
            
            // Instead of failing the entire workflow, continue to the next step if possible
            this.reporter.log(`⚠️ Step "${currentStep.getDescription()}" failed, but continuing workflow execution...`);
            
            // Mark current step as failed but don't terminate workflow
            const stepFailResult = currentStep.fail(`Task failed: ${executionResult.errorReason || 'Unknown error'}`);
            if (stepFailResult.isFailure()) {
              this.reporter.log(`Warning: Failed to mark step as failed: ${stepFailResult.getError()}`);
            }
            
            // Continue to next step instead of terminating workflow
            break; // Break out of task loop to move to next step
          }
        }
        
        this.reporter.log(`✅ Step completed: ${currentStep.getDescription()}`);
        
        // Check if workflow is complete
        const status = this.workflowAggregate!.getExecutionStatus();
        if (status.completionPercentage >= 100) {
          this.reporter.log('🎉 Workflow completed successfully');
          break;
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
            
            if (this.workflowRepository && this.workflow) {
              try {
                await this.workflowRepository.update(this.workflow);
                this.reporter.log(`💾 Completed workflow updated in repository: ${this.workflow.getId().toString()}`);
              } catch (error) {
                this.reporter.log(`⚠️ Failed to update completed workflow in repository: ${error}`);
              }
            }
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
          
          if (this.workflowRepository && this.workflow) {
            try {
              await this.workflowRepository.update(this.workflow);
              this.reporter.log(`💾 Workflow updated in repository: ${this.workflow.getId().toString()}`);
            } catch (error) {
              this.reporter.log(`⚠️ Failed to update workflow in repository: ${error}`);
            }
          }
        }
      }
      
      this.reporter.log(`📊 Final Queue Metrics: ${this.taskQueue.getAllTasks().length} total tasks processed`);
      
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
        memoryLearnings: await this.memoryService.getMemoryPrompt(memoryContext),
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

  private async checkForReplanning(): Promise<boolean> {
    if (!this.stateManager) return false;
    
    const currentState = this.stateManager.getCurrentState();
    const previousState = this.stateManager.getPreviousState();
    
    if (!currentState || !previousState) return false;
    
    // Check if state changed significantly
    if (this.stateManager.hasStateChanged(previousState, currentState)) {
      // Analyze what changed
      const changes = this.analyzeStateChanges(previousState, currentState);
      
      if (changes.requiresReplanning) {
        this.reporter.log('🔄 Significant state change detected, triggering replanning');
        
        // Create checkpoint before replanning
        this.stateManager.createCheckpoint('before-replan');
        
        // Trigger replanning with state context
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
    
    // Calculate differences using the same method as StateManager
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

      // Create replanning request with proper PlannerInput format
      const replanRequest: PlannerInput = {
        goal: this.currentGoal,
        currentUrl: stateContext.currentUrl,
        constraints: [],
        currentState: {
          url: stateContext.currentUrl,
          title: '',
          visibleSections: stateContext.visibleSections,
          availableActions: stateContext.availableActions,
          extractedData: stateContext.extractedData
        }
      };

      // Use planner to create new plan with state context
      const plannerOutput = await this.planner.execute(replanRequest);
      
      if (plannerOutput && plannerOutput.strategy && plannerOutput.strategy.length > 0) {
        this.reporter.log(`📋 Created new plan with ${plannerOutput.strategy.length} steps based on current state`);
        
        // Convert strategic plan to Plan entity
        const planResult = this.convertToPlanEntity(plannerOutput);
        if (planResult.isFailure()) {
          this.reporter.log(`❌ Failed to convert plan: ${planResult.getError()}`);
          return null;
        }
        
        return planResult.getValue();
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

  // Domain Service Integration Methods
  
  /**
   * Creates a plan using the domain planning service
   */
  private async createPlanWithDomainService(goal: string, currentUrl: string): Promise<Result<Plan>> {
    if (!this.planningService) {
      return Result.fail('Planning service not available');
    }

    try {
      // Capture current page state for context
      const currentState = await this.captureSemanticState();
      
      // Create planning context
      const planningContext: PlanningContext = {
        goal,
        url: currentUrl,
        existingPageState: (currentState as any).pageContent,
        previousAttempts: [], // Could be populated from memory service
        availableActions: ['click', 'type', 'navigate', 'extract', 'wait'],
        userInstructions: goal,
        timeConstraints: this.config.timeout || 300000
      };
      
      // Add workflowId if workflow exists (should always exist at this point)
      if (this.workflow) {
        planningContext.workflowId = this.workflow.getId();
      }

      // Use domain service to create plan
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

  // Removed unused executeTaskWithDomainService method

  // Removed unused evaluateTaskWithDomainService method

  // Note: Additional domain service methods could be added here for future enhancements

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
   * Setup TaskQueue event listeners for monitoring integration
   */
  private setupTaskQueueEventListeners(): void {
    // Listen to task queue events and bridge them to the event bus
    this.taskQueue.on('task:enqueued', (data: any) => {
      this.reporter.log(`📥 Task enqueued: ${data.task.name} (Queue: ${data.queueSize}, Ready: ${data.readyCount}, Blocked: ${data.blockedCount})`);
      this.eventBus.emit('queue:task-added', data);
    });

    this.taskQueue.on('task:dequeued', (data: any) => {
      this.reporter.log(`📤 Task dequeued: ${data.task.name} (Remaining: ${data.remainingSize})`);
      this.eventBus.emit('queue:task-removed', data);
    });

    this.taskQueue.on('task:completed', (data: any) => {
      this.reporter.log(`✅ Task completed in queue: ${data.taskId} (Total completed: ${data.completedCount})`);
      this.eventBus.emit('queue:task-completed', data);
    });

    this.taskQueue.on('task:failed', (data: any) => {
      this.reporter.log(`❌ Task failed in queue: ${data.taskId} - ${data.error}`);
      this.eventBus.emit('queue:task-failed', data);
    });

    this.taskQueue.on('task:blocked', (data: any) => {
      this.reporter.log(`🚫 Task blocked: ${data.task.name} (Dependencies: ${data.unmetDependencies.join(', ')})`);
      this.eventBus.emit('queue:task-blocked', data);
    });

    this.taskQueue.on('queue:optimized', (data: any) => {
      this.reporter.log(`🔧 Queue optimized: ${data.queueSize} total, ${data.priorityTasks} priority tasks`);
      this.eventBus.emit('queue:optimized', data);
    });

    this.taskQueue.on('queue:cleanup', (data: any) => {
      this.reporter.log(`🧹 Queue cleanup: removed ${data.removedCount} old completed tasks, ${data.remainingCount} remaining`);
      this.eventBus.emit('queue:cleanup', data);
    });
  }
  
  /**
   * Setup StateManager event listeners for monitoring integration
   */
  private setupStateManagerEventListeners(): void {
    // Listen to StateManager events and bridge them to the event bus
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
    // Domain entity events (if using domain events from entities)
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