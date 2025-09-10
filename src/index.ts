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

/**
 * Export entities and classes
 */
export { Variable } from './core/value-objects/variable';
export { Task } from './core/entities/task';
export { Plan } from './core/entities/plan';
export { Step } from './core/entities/step';

/**
 * Export multi-agent system classes and types (Phase 4)
 */
export { WorkflowManager } from './core/services/workflow-manager';
export { AgentFactory } from './core/factories/agent-factory';
export { 
  MultiAgentConfig, 
  WorkflowResult, 
  PageState,
  StepResult
} from './core/types/agent-types';

/**
 * Export Chat Models
 */
export { ChatOpenAI, ChatOpenAIConfig } from './models/chat-openai';
