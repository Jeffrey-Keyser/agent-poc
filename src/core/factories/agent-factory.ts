import { LLM } from '../interfaces/llm.interface';
import { Browser } from '../interfaces/browser.interface';
import { AgentReporter } from '../interfaces/agent-reporter.interface';
import { EnhancedEventBusInterface } from '../interfaces/event-bus.interface';

import { ITaskPlanner, ITaskExecutor, ITaskEvaluator } from '../interfaces/agent.interface';
import { 
  PlannerConfig, 
  ExecutorConfig, 
  EvaluatorConfig, 
  MultiAgentConfig 
} from '../types/agent-types';

import { TaskPlannerAgent } from '../agents/task-planner/task-planner';
import { TaskExecutorAgent } from '../agents/task-executor/task-executor';
import { TaskEvaluatorAgent } from '../agents/task-evaluator/task-evaluator';
import { ErrorHandlerAgent } from '../agents/error-handler/error-handler';
import { WorkflowManager } from '../services/workflow-manager';
import { DomService } from '@/infra/services/dom-service';

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
   * Create an Error Handler Agent for failure analysis and recovery
   * Uses efficient models for retry strategy decisions
   */
  static createErrorHandler(config: EvaluatorConfig): ErrorHandlerAgent {
    return new ErrorHandlerAgent(config.llm, config);
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
  
  /**
   * Create agents with optimal model selection based on task complexity
   * Automatically selects appropriate models for different agent types
   */
  static createOptimizedAgents(config: MultiAgentConfig, infrastructure: AgentInfrastructure): WorkflowManager {
    const optimizedConfig: WorkflowManagerFactoryConfig = {
      planner: {
        llm: infrastructure.llm,
        model: config.models?.planner || 'gpt-4o-mini', // High-capability for strategic planning
        temperature: 0.3,
        maxRetries: config.maxRetries || 3
      },
      executor: {
        llm: infrastructure.llm,
        model: config.models?.executor || 'gpt-4o-mini', // Efficient for tactical execution
        browser: infrastructure.browser,
        domService: infrastructure.domService,
        temperature: 0.1,
        maxRetries: config.maxRetries || 3
      },
      evaluator: {
        llm: infrastructure.llm,
        model: config.models?.evaluator || 'gpt-4o-mini', // Efficient for binary decisions
        temperature: 0,
        maxRetries: config.maxRetries || 2
      },
      errorHandler: {
        llm: infrastructure.llm,
        model: config.models?.errorHandler || 'gpt-4o-mini', // Efficient for retry decisions
        temperature: 0.1,
        maxRetries: config.maxRetries || 2
      },
      browser: infrastructure.browser,
      domService: infrastructure.domService,
      eventBus: infrastructure.eventBus,
      reporter: infrastructure.reporter,
      workflow: {
        maxRetries: config.maxRetries || 3,
        timeout: config.timeout || 300000,
        enableReplanning: true
      }
    };
    
    return this.createWorkflowManager(optimizedConfig);
  }
}

/**
 * Configuration interface for WorkflowManager factory creation
 */
export interface WorkflowManagerFactoryConfig {
  planner: PlannerConfig;
  executor: ExecutorConfig;
  evaluator: EvaluatorConfig;
  errorHandler: EvaluatorConfig; // Reuses evaluator config pattern
  browser: Browser;
  domService: DomService;
  eventBus: EnhancedEventBusInterface;
  reporter: AgentReporter;
  workflow?: {
    maxRetries?: number;
    timeout?: number;
    enableReplanning?: boolean;
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