import { AgentFactory, AgentInfrastructure } from './core/factories/agent-factory';
import { WorkflowManager } from './core/services/workflow-manager';
import { WorkflowMonitor } from './core/services/workflow-monitor';
import { StateManager } from './core/services/state-manager';
import { TaskQueue } from './core/services/task-queue';
import { MultiAgentConfig } from './core/types/agent-types';
import { Variable } from './core/entities/variable';
import { 
  DeploymentEnvironment, 
  DeploymentConfig, 
  getDeploymentConfig,
  createCustomDeploymentConfig,
  validateDeploymentConfig
} from './core/config/deployment-config';

// Import infrastructure services
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
   * @default false
   */
  headless?: boolean;
  
  /**
   * Variables for sensitive information and dynamic values
   * @default []
   */
  variables?: Variable[];
  
  /**
   * Optional start URL for browser initialization
   * @default 'https://amazon.com'
   */
  startUrl?: string;
  
  /**
   * Enable verbose logging for debugging
   * @default false
   */
  verbose?: boolean;
  
  /**
   * Browser viewport configuration
   */
  viewport?: {
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
  // Initialize infrastructure components
  const infrastructure = initializeInfrastructure(config);
  
  // Create workflow manager with all agents
  const workflowManager = AgentFactory.createOptimizedAgents(config, infrastructure);
  
  // Initialize monitoring and observability
  new WorkflowMonitor(infrastructure.eventBus, infrastructure.reporter);
  
  // Set up state management for future use
  new StateManager(infrastructure.browser, infrastructure.domService);
  
  // Set up task queue for dependency management
  new TaskQueue();
  
  if (config.verbose) {
    infrastructure.reporter.info('🏗️ Multi-agent system initialized successfully');
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
  // Initialize file system for screenshots and temporary data
  const fileSystem = new InMemoryFileSystem();
  const screenshotter = new PlaywrightScreenshoter(fileSystem);
  
  // Initialize browser with configuration
  const browser = new ChromiumBrowser({
    headless: config.headless ?? false
  });
  
  // Initialize event system for workflow monitoring
  const eventBus = new EventBus();
  
  // Initialize DOM service for page interaction
  const domService = new DomService(screenshotter, browser, eventBus);
  
  // Initialize console reporter for progress tracking
  const reporter = new ConsoleReporter(config.reporterName || 'MultiAgent');
  
  return {
    llm: config.llm,
    browser,
    domService,
    eventBus,
    reporter
  };
}

/**
 * Create a multi-agent workflow manager with custom configuration
 * Useful for advanced use cases that need more control over agent setup
 * 
 * @param config Custom workflow manager configuration
 * @returns Configured WorkflowManager
 */
export function createCustomWorkflowManager(
  infrastructure: AgentInfrastructure,
  customConfig: Partial<InitMultiAgentConfig> = {}
): WorkflowManager {
  const defaultConfig: MultiAgentConfig = {
    apiKey: '', // Not used with LLM interface
    headless: false,
    variables: [],
    models: {
      planner: 'gpt-4o-mini',
      executor: 'gpt-4o-mini',
      evaluator: 'gpt-4o-mini',
      errorHandler: 'gpt-4o-mini'
    },
    maxRetries: 3,
    timeout: 300000,
    ...customConfig
  };
  
  return AgentFactory.createOptimizedAgents(defaultConfig, infrastructure);
}

/**
 * Initialize infrastructure components independently
 * Useful for testing or when you need more control over component setup
 * 
 * @param config Partial configuration
 * @returns Infrastructure components
 */
export function initInfrastructure(config: Partial<InitMultiAgentConfig> = {}): AgentInfrastructure {
  return initializeInfrastructure(config as InitMultiAgentConfig);
}

/**
 * Initialize multi-agent system with deployment environment configuration
 * 
 * @param environment The deployment environment (development, testing, staging, production)
 * @param llm The LLM instance to use
 * @param overrides Optional configuration overrides
 * @returns Configured WorkflowManager
 */
export function initMultiAgentForEnvironment(
  environment: DeploymentEnvironment,
  llm: LLM,
  overrides: Partial<InitMultiAgentConfig> = {}
): WorkflowManager {
  const deploymentConfig = getDeploymentConfig(environment);
  
  // Validate the deployment configuration
  validateDeploymentConfig(deploymentConfig);
  
  // Merge deployment config with overrides
  const config: InitMultiAgentConfig = {
    ...deploymentConfig,
    ...overrides,
    llm,
    apiKey: overrides.apiKey || '', // For backward compatibility
    // Deep merge nested objects
    models: { ...deploymentConfig.models, ...overrides.models }
  };
  
  if (config.verbose) {
    console.log(`🏗️ Initializing multi-agent system for ${environment} environment`);
    console.log(`📝 Configuration: ${deploymentConfig.description}`);
  }
  
  return initMultiAgent(config);
}

/**
 * Initialize multi-agent system with custom deployment configuration
 * 
 * @param baseEnvironment Base environment to start from
 * @param llm The LLM instance to use
 * @param customConfig Custom configuration overrides
 * @returns Configured WorkflowManager
 */
export function initMultiAgentWithCustomConfig(
  baseEnvironment: DeploymentEnvironment,
  llm: LLM,
  customConfig: Partial<DeploymentConfig>
): WorkflowManager {
  const deploymentConfig = createCustomDeploymentConfig(baseEnvironment, customConfig);
  validateDeploymentConfig(deploymentConfig);
  
  const config: InitMultiAgentConfig = {
    ...deploymentConfig,
    llm,
    apiKey: '', // Not used with LLM interface
  };
  
  return initMultiAgent(config);
}

// Re-export types and classes for convenience
export { WorkflowManager } from './core/services/workflow-manager';
export { AgentFactory } from './core/factories/agent-factory';
export { MultiAgentConfig, WorkflowResult } from './core/types/agent-types';
export { Variable } from './core/entities/variable';
export { 
  DeploymentEnvironment, 
  DeploymentConfig,
  getDeploymentConfig,
  createCustomDeploymentConfig,
  getRecommendedConfig
} from './core/config/deployment-config';