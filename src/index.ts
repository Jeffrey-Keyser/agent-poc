/**
 * Export the main factory function
 */
export { initAgentsPoc, InitAgentsPocConfig } from './init-agents-poc';

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
 * Export Chat Models
 */
export { ChatOpenAI, ChatOpenAIConfig } from './models/chat-openai';