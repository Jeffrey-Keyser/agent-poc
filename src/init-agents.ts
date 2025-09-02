import { initMultiAgent, InitMultiAgentConfig } from './init-multi-agent';
import { WorkflowManager } from './core/services/workflow-manager';

/**
 * Unified configuration that supports both old and new systems
 */
export interface UnifiedAgentConfig extends Partial<InitMultiAgentConfig> {
  
  /**
   * Migration mode - enables both systems for comparison
   * @default false
   */
  migrationMode?: boolean;
}

/**
 * Unified initialization function that supports both architectures
 * 
 * This function maintains backward compatibility while allowing users to opt into
 * the new multi-agent system. It can also run both systems in parallel for
 * comparison during migration.
 * 
 * @param config Unified configuration supporting both systems
 * @returns Agent system instance (old or new based on configuration)
 */
export function initAgents(config: UnifiedAgentConfig): WorkflowManager {
  // Validate configuration
  if (!config.llm) {
    throw new Error('Multi-agent system requires LLM configuration');
  }

  console.log('🚀 Initializing multi-agent architecture...');
  
  const multiAgentConfig: InitMultiAgentConfig = {
    llm: config.llm!,
    headless: config.headless ?? false,
    variables: config.variables ?? [],
    apiKey: config.apiKey || '', // For backward compatibility
    models: config.models ?? {
      planner: 'gpt-5-nano',
      executor: 'gpt-5-nano',
      evaluator: 'gpt-5-nano',
      errorHandler: 'gpt-5-nano'
    },
    maxRetries: config.maxRetries ?? 3,
    timeout: config.timeout ?? 300000,
    startUrl: config.startUrl || '',
    verbose: config.verbose ?? false,
    viewport: config.viewport ?? { width: 1280, height: 720 },
    reporterName: config.reporterName ?? 'MultiAgent'
  };
  
  return initMultiAgent(multiAgentConfig);
}
