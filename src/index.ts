/**
 * Export the main factory functions
 */
export { initAgentsPoc, InitAgentsPocConfig } from './init-agents-poc';

/**
 * Export the new multi-agent system (Phase 4)
 */
export { 
  initMultiAgent,
  initMultiAgentForEnvironment,
  initMultiAgentWithCustomConfig,
  InitMultiAgentConfig,
  createCustomWorkflowManager,
  initInfrastructure
} from './init-multi-agent';

/**
 * Export unified initialization with backward compatibility
 */
export { 
  initAgents, 
  initAgentsForMigration, 
  assessMigrationReadiness,
  UnifiedAgentConfig 
} from './init-agents';

/**
 * Export migration service and types
 */
export {
  MigrationService,
  MigrationConfig,
  MigrationScenario,
  ComparisonResult,
  MigrationReport,
  MigrationReadiness,
  FeatureFlagConfig,
  FeatureFlags,
  ComparisonOptions,
  ExecutionResult,
  ComparisonMetrics
} from './core/services/migration-service';

/**
 * Export interfaces and types
 */
export { LLM } from './core/interfaces/llm.interface';
export { Reporter } from './core/interfaces/reporter.interface';
export {
  OpenatorResult,
  OpenatorResultStatus,
  OpenatorResultStatuses,
} from './core/entities/openator-result';

export {
  ManagerAgentAction,
  ManagerAgentResponseSchema,
  ManagerResponse,
  ManagerResponseExamples,
} from './core/agents/agents-poc/agents-poc.types';

/**
 * Export entities and classes
 */
export { Variable } from './core/entities/variable';
export { AgentsPoc, AgentsPocConfig } from './core/agents/agents-poc/agents-poc';
export { Task } from './core/entities/task';
export { Run } from './core/entities/run';

/**
 * Export multi-agent system classes and types (Phase 4)
 */
export { WorkflowManager } from './core/services/workflow-manager';
export { AgentFactory } from './core/factories/agent-factory';
export { 
  MultiAgentConfig, 
  WorkflowResult, 
  StrategicTask,
  StrategicPlan,
  PageState,
  StepResult
} from './core/types/agent-types';
export {
  DeploymentEnvironment,
  DeploymentConfig,
  getDeploymentConfig,
  getRecommendedConfig
} from './core/config/deployment-config';

/**
 * Export Chat Models
 */
export { ChatOpenAI, ChatOpenAIConfig } from './models/chat-openai';
