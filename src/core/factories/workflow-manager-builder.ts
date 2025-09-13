import { WorkflowManager } from '../services/workflow-manager';
import { LLM } from '../interfaces/llm.interface';
import { Browser } from '../interfaces/browser.interface';
import { DomService } from '../../infra/services/dom-service';
import { AgentReporter } from '../interfaces/agent-reporter.interface';
import { EnhancedEventBusInterface } from '../interfaces/event-bus.interface';
import { ITaskSummarizer } from '../interfaces/agent.interface';
import { 
  WorkflowRepository, 
  PlanRepository, 
  MemoryRepository 
} from '../repositories';
import { 
  InMemoryWorkflowRepository,
  InMemoryPlanRepository,
  InMemoryMemoryRepository
} from '../../infrastructure/repositories';
import { BrowserExecutionService, AIEvaluationService } from '../../infrastructure/services';
import { TaskSummarizerAgent } from '../agents/task-summarizer';
import { MicroActionExecutor } from '../../infrastructure/services/micro-action-executor';
import { VariableManager } from '../services/variable-manager';
import { Variable } from '../value-objects';
import { WorkflowOrchestrator } from '../domain-services/workflow-orchestrator';
import { WorkflowPlanningService } from '../domain-services/workflow-planning-service';
import { WorkflowEventCoordinator } from '../domain-services/workflow-event-coordinator';
import { WorkflowStateCoordinator } from '../domain-services/workflow-state-coordinator';
import { AITaskPlanningService } from '../domain-services/planning-service';
import { MemoryService } from '../services/memory-service';
import { StateManager } from '../services/state-manager';

export interface BuilderConfig {
  llm: LLM;
  browser: Browser;
  eventBus: EnhancedEventBusInterface;
  reporter: AgentReporter;
  domService?: DomService;
  maxRetries?: number;
  timeout?: number;
  enableDetailedLogging?: boolean;
  variables?: Variable[];
}

export class WorkflowManagerBuilder {
  private config: Partial<BuilderConfig> = {};
  private repositories?: {
    workflow: WorkflowRepository;
    plan: PlanRepository;
    memory: MemoryRepository;
  };
  
  withLLM(llm: LLM): this {
    this.config.llm = llm;
    return this;
  }
  
  withBrowser(browser: Browser): this {
    this.config.browser = browser;
    return this;
  }
  
  withEventBus(eventBus: EnhancedEventBusInterface): this {
    this.config.eventBus = eventBus;
    return this;
  }
  
  withReporter(reporter: AgentReporter): this {
    this.config.reporter = reporter;
    return this;
  }
  
  withDomService(domService: DomService): this {
    this.config.domService = domService;
    return this;
  }
  
  withRepositories(repos: {
    workflow: WorkflowRepository;
    plan: PlanRepository;
    memory: MemoryRepository;
  }): this {
    this.repositories = repos;
    return this;
  }
  
  withRetryConfig(maxRetries: number, timeout: number): this {
    this.config.maxRetries = maxRetries;
    this.config.timeout = timeout;
    return this;
  }
  
  withLogging(enableDetailedLogging: boolean): this {
    this.config.enableDetailedLogging = enableDetailedLogging;
    return this;
  }
  
  withVariables(variables: Variable[]): this {
    this.config.variables = variables;
    return this;
  }
  
  build(): WorkflowManager {
    // Validate required dependencies
    if (!this.config.llm) throw new Error('LLM is required');
    if (!this.config.browser) throw new Error('Browser is required');
    if (!this.config.eventBus) throw new Error('EventBus is required');
    if (!this.config.reporter) throw new Error('Reporter is required');
    
    // Use defaults where needed - Note: DomService requires dependencies, so must be provided
    if (!this.config.domService) {
      throw new Error('DomService is required - cannot create default instance');
    }
    const domService = this.config.domService;
    const repositories = this.repositories || {
      workflow: new InMemoryWorkflowRepository(),
      plan: new InMemoryPlanRepository(),
      memory: new InMemoryMemoryRepository()
    };
    
    // Create variable manager
    const variableManager = new VariableManager(this.config.variables || []);
    
    // Create micro action executor
    const microActionExecutor = new MicroActionExecutor(
      this.config.browser!,
      domService,
      variableManager
    );
    
    // Create infrastructure services
    const executionService = new BrowserExecutionService(
      this.config.llm!,
      this.config.browser!,
      domService,
      microActionExecutor,
      {
        llm: this.config.llm!,
        browser: this.config.browser!,
        domService: domService,
        maxRetries: this.config.maxRetries || 3
      }
    );
    
    const evaluationService = new AIEvaluationService(
      this.config.llm!,
      {
        llm: this.config.llm!,
        domService: this.config.domService!,
        maxRetries: this.config.maxRetries || 2
      }
    );
    
    // Create summarizer
    const summarizer: ITaskSummarizer = new TaskSummarizerAgent(
      this.config.llm!,
      {
        llm: this.config.llm!,
        maxRetries: this.config.maxRetries || 3,
        includeRecommendations: true,
        maxSummaryLength: 500
      }
    );
    
    // Create domain services using the extracted service pattern
    const memoryService = new MemoryService(this.config.eventBus!, repositories.memory);
    const stateManager = new StateManager(this.config.browser!, domService);
    const planningService = new AITaskPlanningService(
      stateManager,
      this.config.llm!,
      memoryService
    );
    
    // Create extracted services
    const orchestrator = new WorkflowOrchestrator(
      executionService,
      evaluationService,
      this.config.eventBus!,
      this.config.reporter!,
      {
        maxRetries: this.config.maxRetries || 3,
        timeout: this.config.timeout || 300000
      }
    );
    
    const workflowPlanningService = new WorkflowPlanningService(
      planningService,
      stateManager,
      this.config.eventBus!,
      this.config.reporter!
    );
    
    const eventCoordinator = new WorkflowEventCoordinator(
      this.config.eventBus!,
      this.config.reporter!,
      { enableDetailedLogging: this.config.enableDetailedLogging || false }
    );
    
    const stateCoordinator = new WorkflowStateCoordinator(
      this.config.browser!,
      domService,
      repositories.memory,
      this.config.eventBus!,
      this.config.reporter!
    );
    
    // Create simplified WorkflowManager with new constructor signature
    return new WorkflowManager(
      orchestrator,
      workflowPlanningService,
      eventCoordinator,
      stateCoordinator,
      repositories,
      summarizer,
      {
        maxRetries: this.config.maxRetries || 3,
        timeout: this.config.timeout || 300000,
        enableReplanning: true,
        allowEarlyExit: false,
        minAcceptableCompletion: 60
      }
    );
  }
}