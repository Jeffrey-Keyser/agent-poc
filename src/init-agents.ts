import { initAgentsPoc, InitAgentsPocConfig } from './init-agents-poc';
import { initMultiAgent, InitMultiAgentConfig } from './init-multi-agent';
import { AgentsPoc } from './core/agents/agents-poc/agents-poc';
import { WorkflowManager } from './core/services/workflow-manager';
import { 
  MigrationService, 
  MigrationConfig, 
  MigrationScenario, 
  ComparisonResult, 
  MigrationReport, 
  FeatureFlagConfig, 
  FeatureFlags 
} from './core/services/migration-service';

/**
 * Unified configuration that supports both old and new systems
 */
export interface UnifiedAgentConfig extends Partial<InitAgentsPocConfig>, Partial<InitMultiAgentConfig> {
  /**
   * Use the new multi-agent architecture
   * @default false (maintains backward compatibility)
   */
  useMultiAgent?: boolean;
  
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
export function initAgents(config: UnifiedAgentConfig): AgentsPoc | WorkflowManager {
  // Validate configuration
  if (config.useMultiAgent && !config.llm) {
    throw new Error('Multi-agent system requires LLM configuration');
  }
  
  if (!config.useMultiAgent && !config.llm) {
    throw new Error('Legacy system requires LLM configuration');
  }
  
  // Use new multi-agent system
  if (config.useMultiAgent) {
    console.log('🚀 Initializing new multi-agent architecture...');
    
    const multiAgentConfig: InitMultiAgentConfig = {
      llm: config.llm!,
      headless: config.headless ?? false,
      variables: config.variables ?? [],
      apiKey: config.apiKey || '', // For backward compatibility
      models: config.models ?? {
        planner: 'gpt-4o-mini',
        executor: 'gpt-4o-mini',
        evaluator: 'gpt-4o-mini',
        errorHandler: 'gpt-4o-mini'
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
  
  // Use legacy system (default)
  console.log('🔧 Initializing legacy agent architecture...');
  
  const legacyConfig: InitAgentsPocConfig = {
    llm: config.llm!,
    headless: config.headless ?? false,
    variables: config.variables ?? []
  };
  
  return initAgentsPoc(legacyConfig);
}

/**
 * Migration helper: Initialize both systems for comparison with full migration service
 * 
 * This function creates both the legacy and new systems with comprehensive
 * migration tooling including assessment, benchmarking, and feature flags.
 * 
 * @param config Configuration for both systems
 * @returns Object containing both agent systems and migration tools
 */
export function initAgentsForMigration(config: UnifiedAgentConfig) {
  console.log('🔄 Initializing comprehensive migration environment...');
  
  if (!config.llm) {
    throw new Error('Migration mode requires LLM configuration');
  }
  
  const legacyConfig: InitAgentsPocConfig = {
    llm: config.llm,
    headless: config.headless ?? false,
    variables: config.variables ?? []
  };
  
  const multiAgentConfig: InitMultiAgentConfig = {
    llm: config.llm,
    headless: config.headless ?? false,
    variables: config.variables ?? [],
    apiKey: config.apiKey || '',
    models: config.models || {
      planner: 'gpt-4o-mini',
      executor: 'gpt-4o-mini',
      evaluator: 'gpt-4o-mini',
      errorHandler: 'gpt-4o-mini'
    },
    maxRetries: config.maxRetries ?? 3,
    timeout: config.timeout ?? 300000,
    reporterName: 'Migration'
  };
  
  const legacy = initAgentsPoc(legacyConfig);
  const multiAgent = initMultiAgent(multiAgentConfig);
  
  const migrationConfig: MigrationConfig = {
    variables: config.variables ?? [],
    timeout: config.timeout ?? 300000,
    reporterName: 'Migration'
  };
  
  const migrationService = new MigrationService(legacy, multiAgent, migrationConfig);
  
  return {
    legacy,
    multiAgent,
    migrationService,
    
    /**
     * Execute the same goal on both systems and compare results
     * @deprecated Use migrationService.compareExecution instead
     */
    async compareExecution(goal: string): Promise<ComparisonResult> {
      return migrationService.compareExecution(goal);
    },
    
    /**
     * Run comprehensive migration assessment with multiple scenarios
     */
    async runMigrationAssessment(scenarios: MigrationScenario[]): Promise<MigrationReport> {
      return migrationService.runMigrationAssessment(scenarios);
    },
    
    /**
     * Check system readiness for migration
     */
    assessReadiness() {
      return migrationService.assessReadiness();
    },
    
    /**
     * Create feature flags for controlled rollout
     */
    createFeatureFlags(config: FeatureFlagConfig): FeatureFlags {
      return migrationService.createFeatureFlags(config);
    },
    
    /**
     * Get recommended migration scenarios for testing
     */
    getRecommendedScenarios(): MigrationScenario[] {
      return [
        {
          name: 'Simple Navigation',
          goal: 'Navigate to the login page',
          delay: 1000
        },
        {
          name: 'Basic Search',
          goal: 'Search for wireless headphones',
          delay: 2000
        },
        {
          name: 'Form Interaction',
          goal: 'Fill out the contact form with name and email',
          delay: 1500
        },
        {
          name: 'Data Extraction',
          goal: 'Extract the top 3 product names from the results page',
          delay: 2000
        },
        {
          name: 'Complex Workflow',
          goal: 'Login, search for products under $100, and add first result to cart',
          delay: 3000
        }
      ];
    },
    
    /**
     * Generate migration report with standard scenarios
     */
    async generateStandardReport(): Promise<MigrationReport> {
      const scenarios = this.getRecommendedScenarios();
      return this.runMigrationAssessment(scenarios);
    }
  };
}

/**
 * Check if a project is ready for migration to multi-agent system
 * 
 * @param currentConfig Current system configuration
 * @returns Migration readiness assessment
 */
export function assessMigrationReadiness(currentConfig: InitAgentsPocConfig) {
  const readiness = {
    ready: true,
    issues: [] as string[],
    recommendations: [] as string[]
  };
  
  // Check for breaking changes
  if (!currentConfig.llm) {
    readiness.ready = false;
    readiness.issues.push('LLM configuration required');
  }
  
  // Add recommendations
  readiness.recommendations.push('Test with development environment first');
  readiness.recommendations.push('Use migration mode for gradual transition');
  readiness.recommendations.push('Monitor performance metrics during migration');
  
  return readiness;
}
