import { AgentInfrastructure } from './core/factories/agent-factory';
import { WorkflowFactory } from './core/factories/workflow-factory';
import { WorkflowManager } from './core/services/workflow-manager';
import { MultiAgentConfig } from './core/types/agent-types';
import { ChromiumBrowser } from './infra/services/chromium-browser';
import { InMemoryFileSystem } from './infra/services/in-memory-file-system';
import { PlaywrightScreenshoter } from './infra/services/playwright-screenshotter';
import { DomService } from './infra/services/dom-service';
import { ConsoleReporter } from './infra/services/console-reporter';
import { EventBus } from './core/services/realtime-reporter';
import { LLM } from './core/types';

/**
 * Configuration interface for the multi-agent system
 * Extends the base MultiAgentConfig with additional deployment options
 */
export interface InitMultiAgentConfig extends MultiAgentConfig {
  /**
   * The LLM instance to use across all agents
   */
  llm: LLM;
  
  /**
   * Whether to run the browser in headless mode
   */
  headless: boolean;
  
  /**
   * Optional start URL for browser initialization
   * @default 'https://google.com'
   */
  startUrl?: string;
  
  /**
   * Enable verbose logging for debugging
   */
  verbose: boolean;
  
  /**
   * Browser viewport configuration
   */
  viewport: {
    width: number;
    height: number;
  };
  
  /**
   * Custom reporter name for console output
   * @default 'MultiAgent'
   */
  reporterName?: string;
}

/**
 * Initialize the multi-agent system with all specialized agents and orchestration
 * 
 * This function sets up the complete infrastructure required for the multi-agent
 * architecture, including browsers, DOM services, event systems, and all specialized
 * agents. It returns a configured WorkflowManager ready to execute user goals.
 * 
 * @param config Configuration for the multi-agent system
 * @returns Configured WorkflowManager instance
 */
export function initMultiAgent(config: InitMultiAgentConfig): WorkflowManager {
  const infrastructure = initializeInfrastructure(config);
  const workflowManager = WorkflowFactory.create({
    llm: config.llm,
    models: config.models,
    headless: config.headless,
    variables: config.variables,
    startUrl: config.startUrl || 'https://google.com',
    maxRetries: config.maxRetries,
    timeout: config.timeout,
    verbose: config.verbose,
    reporterName: config.reporterName || 'MultiAgent',
    viewport: config.viewport
  }, infrastructure);
  
  if (config.verbose) {
    infrastructure.reporter.info('🏗️ Multi-agent system initialized with simplified factory');
    infrastructure.reporter.info(`📊 Configuration: ${JSON.stringify({
      models: config.models,
      maxRetries: config.maxRetries,
      timeout: config.timeout,
      headless: config.headless,
      variables: config.variables?.length || 0
    }, null, 2)}`);
  }
  
  return workflowManager;
}

/**
 * Initialize all infrastructure components required by the multi-agent system
 * 
 * @param config System configuration
 * @returns Configured infrastructure components
 */
function initializeInfrastructure(config: InitMultiAgentConfig): AgentInfrastructure {
  const fileSystem = new InMemoryFileSystem();
  const screenshotter = new PlaywrightScreenshoter(fileSystem);
  
  const browser = new ChromiumBrowser({
    headless: config.headless ?? false
  });
  
  const eventBus = new EventBus();
  const domService = new DomService(screenshotter, browser, eventBus);
  const reporter = new ConsoleReporter(config.reporterName || 'MultiAgent');
  
  return {
    browser,
    domService,
    eventBus,
    reporter
  };
}
