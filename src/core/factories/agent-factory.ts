import { LLM } from '../interfaces/llm.interface';
import { Browser } from '../interfaces/browser.interface';
import { AgentReporter } from '../interfaces/agent-reporter.interface';
import { EnhancedEventBusInterface } from '../interfaces/event-bus.interface';
import { ITaskPlanner, ITaskExecutor, ITaskEvaluator, ITaskSummarizer } from '../interfaces/agent.interface';
import { 
  PlannerConfig, 
  ExecutorConfig, 
  EvaluatorConfig, 
  MultiAgentConfig 
} from '../types/agent-types';
import { TaskPlannerAgent } from '../agents/task-planner/task-planner';
import { TaskExecutorAgent } from '../agents/task-executor/task-executor';
import { TaskEvaluatorAgent } from '../agents/task-evaluator/task-evaluator';
import { TaskSummarizerAgent, SummarizerConfig } from '../agents/task-summarizer';
import { WorkflowManager } from '../services/workflow-manager';
import { DomService } from '@/infra/services/dom-service';
import { TaskQueue } from '../services/task-queue';
import { StateManager } from '../services/state-manager';
import { WorkflowMonitor } from '../services/workflow-monitor';
import { 
  AITaskPlanningService,
  BrowserExecutionService, 
  AIEvaluationService,
  PlanningService,
  ExecutionService, 
  EvaluationService
} from '../../infrastructure/services';
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

/**
 * Factory for creating specialized agents with proper configuration
 * 
 * This factory encapsulates the complexity of agent instantiation and ensures
 * consistent configuration across all agent types. It follows the factory pattern
 * to provide clean separation between creation and usage of agents.
 */
export class AgentFactory {

  /**
   * Create a Task Planner Agent configured for strategic planning
   * Uses higher-capability models for complex reasoning tasks
   */
  static createPlanner(config: PlannerConfig): ITaskPlanner {
    return new TaskPlannerAgent(config.llm, config);
  }

  /**
   * Create a Task Executor Agent configured for tactical execution
   * Uses efficient models for repeated DOM interaction tasks
   */
  static createExecutor(config: ExecutorConfig): ITaskExecutor {
    return new TaskExecutorAgent(
      config.llm,
      config.browser,
      config.domService,
      config
    );
  }
  
  /**
   * Create a Task Evaluator Agent configured for outcome validation
   * Uses efficient models for binary success/failure decisions
   */
  static createEvaluator(config: EvaluatorConfig): ITaskEvaluator {
    return new TaskEvaluatorAgent(config.llm, config);
  }

  /**
   * Create a Task Summarizer Agent for generating clean workflow summaries
   * Uses efficient models for structured data extraction and cleaning
   */
  static createSummarizer(config: SummarizerConfig): ITaskSummarizer {
    return new TaskSummarizerAgent(config.llm, config);
  }

  /**
   * Create a complete Workflow Manager with all agents configured
   * This is the main orchestrator that coordinates all specialized agents
   */
  static createWorkflowManager(config: WorkflowManagerFactoryConfig): WorkflowManager {
    const planner = this.createPlanner(config.planner);
    const executor = this.createExecutor(config.executor);
    const evaluator = this.createEvaluator(config.evaluator);
    
    return new WorkflowManager(
      planner,
      executor,
      evaluator,
      config.eventBus,
      config.browser,
      config.domService,
      config.reporter,
      config.workflow || {}
    );
  }

  static createDomainServicesWithIntegration(
    infrastructure: AgentInfrastructure,
    _taskQueue?: TaskQueue,
    _stateManager?: StateManager
  ): {
    planningService: PlanningService;
    executionService: ExecutionService;
    evaluationService: EvaluationService;
  } {
    // Create planning service with StateManager integration
    const planningService = new AITaskPlanningService(
      infrastructure.llm,
      {
        llm: infrastructure.llm,
        model: 'gpt-5-nano',
        maxRetries: 3
      }
    );

    // Create execution service with TaskQueue integration  
    const executionService = new BrowserExecutionService(
      infrastructure.llm,
      infrastructure.browser,
      infrastructure.domService,
      {
        llm: infrastructure.llm,
        model: 'gpt-5-nano',
        browser: infrastructure.browser,
        domService: infrastructure.domService,
        maxRetries: 3
      }
    );

    // Create evaluation service with StateManager integration
    const evaluationService = new AIEvaluationService(
      infrastructure.llm,
      {
        llm: infrastructure.llm,
        model: 'gpt-5-nano',
        maxRetries: 2
      }
    );

    return {
      planningService,
      executionService,
      evaluationService
    };
  }

  static createRepositories(): {
    workflowRepository: WorkflowRepository;
    planRepository: PlanRepository;
    memoryRepository: MemoryRepository;
  } {
    // Create in-memory implementations for development and testing
    // In production, these could be swapped for database-backed implementations
    return {
      workflowRepository: new InMemoryWorkflowRepository(),
      planRepository: new InMemoryPlanRepository(),
      memoryRepository: new InMemoryMemoryRepository()
    };
  }

  static createWorkflowManagerWithFullIntegration(
    config: MultiAgentConfig,
    infrastructure: AgentInfrastructure
  ): WorkflowManager {
    const taskQueue = new TaskQueue();
    const stateManager = new StateManager(infrastructure.browser, infrastructure.domService);
    const workflowMonitor = new WorkflowMonitor(infrastructure.eventBus, infrastructure.reporter);

    const domainServices = this.createDomainServicesWithIntegration(
      infrastructure,
      taskQueue,
      stateManager
    );

    const repositories = this.createRepositories();

    const summarizer = this.createSummarizer({
      llm: infrastructure.llm,
      model: config.models?.summarizer || 'gpt-5-nano',
      maxRetries: config.maxRetries || 3,
      includeRecommendations: true,
      maxSummaryLength: 500
    });

    // Create workflow manager configuration with all integrations
    const workflowConfig: WorkflowManagerFactoryConfig = {
      planner: {
        llm: infrastructure.llm,
        model: config.models?.planner || 'gpt-5-nano',
        maxRetries: config.maxRetries || 3
      },
      executor: {
        llm: infrastructure.llm,
        model: config.models?.executor || 'gpt-5-nano',
        browser: infrastructure.browser,
        domService: infrastructure.domService,
        maxRetries: config.maxRetries || 3
      },
      evaluator: {
        llm: infrastructure.llm,
        model: config.models?.evaluator || 'gpt-5-nano',
        maxRetries: config.maxRetries || 2
      },
      errorHandler: {
        llm: infrastructure.llm,
        model: config.models?.errorHandler || 'gpt-5-nano',
        maxRetries: config.maxRetries || 2
      },
      browser: infrastructure.browser,
      domService: infrastructure.domService,
      eventBus: infrastructure.eventBus,
      reporter: infrastructure.reporter,
      workflow: {
        maxRetries: config.maxRetries || 3,
        timeout: config.timeout || 300000,
        enableReplanning: true,
        summarizer,
        ...(taskQueue && { taskQueue }),
        ...(stateManager && { stateManager }),
        ...(workflowMonitor && { workflowMonitor }),
        ...domainServices,
        ...repositories,
      }
    };

    return this.createWorkflowManager(workflowConfig);
  }
}

/**
 * Configuration interface for WorkflowManager factory creation
 */
export interface WorkflowManagerFactoryConfig {
  planner: PlannerConfig;
  executor: ExecutorConfig;
  evaluator: EvaluatorConfig;
  errorHandler: EvaluatorConfig;
  browser: Browser;
  domService: DomService;
  eventBus: EnhancedEventBusInterface;
  reporter: AgentReporter;
  workflow?: {
    maxRetries?: number;
    timeout?: number;
    enableReplanning?: boolean;
    summarizer?: ITaskSummarizer;
    // Phase 1-3: Core service integrations
    taskQueue?: TaskQueue;
    stateManager?: StateManager;
    workflowMonitor?: WorkflowMonitor;
    enableQueueIntegration?: boolean;
    enableStateIntegration?: boolean;
    enableMonitorIntegration?: boolean;
    // Phase 4: Domain Services support
    planningService?: PlanningService;
    executionService?: ExecutionService;
    evaluationService?: EvaluationService;
    enableDomainServices?: boolean;
    // Phase 5: Repository support
    workflowRepository?: WorkflowRepository;
    planRepository?: PlanRepository;
    memoryRepository?: MemoryRepository;
    enableRepositories?: boolean;
  };
}

/**
 * Infrastructure components required for agent creation
 */
export interface AgentInfrastructure {
  llm: LLM;
  browser: Browser;
  domService: DomService;
  eventBus: EnhancedEventBusInterface;
  reporter: AgentReporter;
}