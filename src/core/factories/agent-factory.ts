import { LLM } from '../interfaces/llm.interface';
import { Browser } from '../interfaces/browser.interface';
import { AgentReporter } from '../interfaces/agent-reporter.interface';
import { EnhancedEventBusInterface } from '../interfaces/event-bus.interface';
import { ITaskPlanner, ITaskExecutor, ITaskEvaluator, ITaskSummarizer } from '../interfaces/agent.interface';
import { 
  ExecutorConfig, 
  EvaluatorConfig
} from '../types/agent-types';
import { TaskPlannerAgent } from '../agents/task-planner/task-planner';
import { TaskExecutorAgent } from '../agents/task-executor/task-executor';
import { TaskEvaluatorAgent } from '../agents/task-evaluator/task-evaluator';
import { TaskSummarizerAgent, SummarizerConfig } from '../agents/task-summarizer';
import { DomService } from '@/infra/services/dom-service';

/**
 * Factory for creating specialized agents with proper configuration
 * 
 * This factory provides basic agent creation methods. For WorkflowManager creation,
 * use the new WorkflowFactory class which provides a simplified interface.
 */
export class AgentFactory {

  /**
   * Create a Task Planner Agent configured for strategic planning
   * Uses higher-capability models for complex reasoning tasks
   */
  static createPlanner(llm: LLM): ITaskPlanner {
    return new TaskPlannerAgent(llm);
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