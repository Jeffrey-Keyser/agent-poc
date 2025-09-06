import { LLM } from '../interfaces/llm.interface';
import { Browser } from '../interfaces/browser.interface';
import { AgentReporter } from '../interfaces/agent-reporter.interface';
import { EnhancedEventBusInterface } from '../interfaces/event-bus.interface';
import { ITaskSummarizer } from '../interfaces/agent.interface';
import { WorkflowManager } from '../services/workflow-manager';
import { DomService } from '@/infra/services/dom-service';
import { TaskSummarizerAgent } from '../agents/task-summarizer';
import { 
  BrowserExecutionService, 
  AIEvaluationService,
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
 * Simplified configuration interface for WorkflowFactory
 */
export interface WorkflowConfig {
  llm: LLM;
  models?: {
    planner?: string;
    executor?: string;
    evaluator?: string;
    summarizer?: string;
  };
  browser?: BrowserConfig;
  maxRetries?: number;
  timeout?: number;
  enableReplanning?: boolean;
  verbose?: boolean;
  reporterName?: string;
}

/**
 * Browser configuration interface
 */
export interface BrowserConfig {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
}

/**
 * Infrastructure components bundle
 */
interface Infrastructure {
  eventBus: EnhancedEventBusInterface;
  browser: Browser;
  domService: DomService;
  reporter: AgentReporter;
}

/**
 * Domain services bundle
 */
interface Services {
  executionService: ExecutionService;
  evaluationService: EvaluationService;
}

/**
 * Repositories bundle
 */
interface Repositories {
  workflowRepository: WorkflowRepository;
  planRepository: PlanRepository;
  memoryRepository: MemoryRepository;
}

/**
 * Simplified factory for creating WorkflowManager instances with all required dependencies
 * 
 * This factory replaces the complex AgentFactory pattern with a single, clean entry point
 * that ensures all services and repositories are properly configured and injected.
 */
export class WorkflowFactory {
  
  /**
   * Main factory method for creating a fully configured WorkflowManager
   * 
   * @param config Simplified configuration object
   * @returns Configured WorkflowManager instance
   */
  static create(
    config: WorkflowConfig, 
    infrastructure: Infrastructure
  ): WorkflowManager {
    const services = this.createDomainServices(infrastructure, config);
    const repositories = this.createRepositories(config);
    
    return new WorkflowManager(
      config.llm,
      services.executionService,
      services.evaluationService,
      repositories.workflowRepository,
      repositories.planRepository,
      repositories.memoryRepository,
      infrastructure.eventBus,
      infrastructure.browser,
      infrastructure.domService,
      infrastructure.reporter,
      {
        maxRetries: config.maxRetries || 3,
        timeout: config.timeout || 300000,
        enableReplanning: config.enableReplanning ?? true,
        summarizer: this.createSummarizer(config.llm, config)
      }
    );
  }
  
  /**
   * Create domain services with consistent configuration
   */
  private static createDomainServices(
    infrastructure: Infrastructure, 
    config: WorkflowConfig
  ): Services {
    const executionService = new BrowserExecutionService(
      config.llm,
      infrastructure.browser,
      infrastructure.domService,
      {
        llm: config.llm,
        model: config.models?.executor || 'gpt-5-nano',
        browser: infrastructure.browser,
        domService: infrastructure.domService,
        maxRetries: config.maxRetries || 3
      }
    );

    const evaluationService = new AIEvaluationService(
      config.llm,
      {
        llm: config.llm,
        model: config.models?.evaluator || 'gpt-5-nano',
        maxRetries: config.maxRetries || 2
      }
    );

    return {
      executionService,
      evaluationService
    };
  }
  
  /**
   * Create repository implementations
   * Uses in-memory implementations by default, can be extended for persistent storage
   */
  private static createRepositories(_config: WorkflowConfig): Repositories {
    return {
      workflowRepository: new InMemoryWorkflowRepository(),
      planRepository: new InMemoryPlanRepository(),
      memoryRepository: new InMemoryMemoryRepository()
    };
  }
  
  /**
   * Create task summarizer with configuration
   */
  private static createSummarizer(llm: LLM, config: WorkflowConfig): ITaskSummarizer {
    return new TaskSummarizerAgent(llm, {
      llm,
      model: config.models?.summarizer || 'gpt-5-nano',
      maxRetries: config.maxRetries || 3,
      includeRecommendations: true,
      maxSummaryLength: 500
    });
  }
}