/**
 * Export the new multi-agent system (Phase 4)
 */
export { 
  initMultiAgent,
  InitMultiAgentConfig
} from './init-multi-agent';

/**
 * Export interfaces and types
 */
export { LLM } from './core/interfaces/llm.interface';
export {
  OpenatorResult,
  OpenatorResultStatus,
  OpenatorResultStatuses,
} from './core/entities/openator-result';

/**
 * Export entities and classes
 */
export { Variable } from './core/value-objects/variable';

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
