import { AgentsPoc } from '../agents/agents-poc/agents-poc';
import { WorkflowManager } from './workflow-manager';
import { Variable } from '../entities/variable';
import { ConsoleReporter } from '../../infra/services/console-reporter';

/**
 * MigrationService - Handles gradual migration from legacy to multi-agent system
 * 
 * This service provides:
 * 1. Side-by-side system comparison
 * 2. Migration readiness assessment
 * 3. Performance benchmarking
 * 4. Rollback capabilities
 * 5. Feature flagging for controlled rollout
 */
export class MigrationService {
  private reporter: ConsoleReporter;
  
  constructor(
    private legacy: AgentsPoc,
    private multiAgent: WorkflowManager,
    private config: MigrationConfig
  ) {
    this.reporter = new ConsoleReporter('Migration');
  }

  /**
   * Execute the same task on both systems and compare results
   */
  async compareExecution(goal: string, options: ComparisonOptions = {}): Promise<ComparisonResult> {
    this.reporter.info(`🔬 Starting comparison for: "${goal}"`);
    
    const startTime = Date.now();
    const results: ComparisonResult = {
      goal,
      startTime: new Date(),
      legacy: null,
      multiAgent: null,
      winner: null,
      recommendation: '',
      metrics: {
        executionTime: { legacy: 0, multiAgent: 0 },
        successRate: { legacy: 0, multiAgent: 0 },
        errorCount: { legacy: 0, multiAgent: 0 },
        stepsCount: { legacy: 0, multiAgent: 0 }
      }
    };

    // Execute on both systems
    if (options.executeLegacy !== false) {
      results.legacy = await this.executeLegacySystem(goal);
    }
    
    if (options.executeMultiAgent !== false) {
      results.multiAgent = await this.executeMultiAgentSystem(goal);
    }

    // Calculate metrics
    results.metrics = this.calculateMetrics(results);
    results.winner = this.determineWinner(results);
    results.recommendation = this.generateRecommendation(results);
    
    const totalTime = Date.now() - startTime;
    this.reporter.info(`⏱️  Total comparison time: ${totalTime}ms`);
    this.reporter.info(`🏆 Winner: ${results.winner}`);
    this.reporter.info(`💡 Recommendation: ${results.recommendation}`);

    return results;
  }

  /**
   * Execute multiple test scenarios and generate migration report
   */
  async runMigrationAssessment(scenarios: MigrationScenario[]): Promise<MigrationReport> {
    this.reporter.info(`📊 Running migration assessment with ${scenarios.length} scenarios`);
    
    const results: ComparisonResult[] = [];
    const errors: string[] = [];
    
    for (const scenario of scenarios) {
      try {
        this.reporter.info(`\n🎯 Testing scenario: ${scenario.name}`);
        const result = await this.compareExecution(scenario.goal, scenario.options);
        results.push(result);
        
        // Wait between scenarios to avoid rate limits
        if (scenario.delay) {
          await this.wait(scenario.delay);
        }
        
      } catch (error) {
        const errorMsg = `Scenario "${scenario.name}" failed`;
        errors.push(errorMsg);
        this.reporter.failure(errorMsg);
      }
    }

    return this.generateMigrationReport(results, errors);
  }

  /**
   * Check system readiness for migration
   */
  assessReadiness(): MigrationReadiness {
    const assessment: MigrationReadiness = {
      ready: true,
      score: 0,
      blockers: [],
      warnings: [],
      recommendations: []
    };

    // Check critical dependencies
    try {
      // Test legacy system
      if (!this.legacy) {
        assessment.blockers.push('Legacy system not initialized');
        assessment.ready = false;
      }

      // Test multi-agent system
      if (!this.multiAgent) {
        assessment.blockers.push('Multi-agent system not initialized');
        assessment.ready = false;
      }

      // Check configuration compatibility
      const configIssues = this.validateConfiguration();
      assessment.warnings.push(...configIssues);

      // Calculate readiness score
      assessment.score = this.calculateReadinessScore(assessment);

      // Generate recommendations
      assessment.recommendations = this.generateMigrationRecommendations(assessment);

    } catch (error) {
      assessment.blockers.push(`Assessment failed`);
      assessment.ready = false;
    }

    return assessment;
  }

  /**
   * Create a feature flag system for controlled rollout
   */
  createFeatureFlags(config: FeatureFlagConfig): FeatureFlags {
    return {
      useMultiAgent: this.shouldUseMultiAgent(config),
      enableComparison: config.comparisonMode || false,
      rolloutPercentage: config.rolloutPercentage || 0,
      
      shouldUseLegacy: () => !this.shouldUseMultiAgent(config),
      
      logDecision: (decision: string, reason: string) => {
        this.reporter.info(`🚩 Feature flag decision: ${decision} (${reason})`);
      }
    };
  }

  private async executeLegacySystem(goal: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      this.reporter.info('🔧 Executing on legacy system...');
      
      // Convert goal to legacy format - this is a simplified conversion
      const legacyTask = {
        variables: this.config.variables || [],
        // Legacy system expects specific task format
        goal: goal,
        description: goal
      };
      
      const result = await this.legacy.run(legacyTask as any);
      
      return {
        system: 'legacy',
        success: result?.status === 'success',
        duration: Date.now() - startTime,
        steps: result?.stepCount || 0,
        errors: result?.errors || [],
        result: result
      };
      
    } catch (error) {
      return {
        system: 'legacy',
        success: false,
        duration: Date.now() - startTime,
        steps: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        result: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async executeMultiAgentSystem(goal: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      this.reporter.info('🚀 Executing on multi-agent system...');
      
      const result = await this.multiAgent.executeWorkflow(goal);
      
      return {
        system: 'multiAgent',
        success: result.status === 'success',
        duration: Date.now() - startTime,
        steps: result.completedTasks?.length || 0,
        errors: result.errors || [],
        result: result
      };
      
    } catch (error) {
      return {
        system: 'multiAgent',
        success: false,
        duration: Date.now() - startTime,
        steps: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        result: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private calculateMetrics(results: ComparisonResult): ComparisonMetrics {
    const legacy = results.legacy;
    const multiAgent = results.multiAgent;
    
    return {
      executionTime: {
        legacy: legacy?.duration || 0,
        multiAgent: multiAgent?.duration || 0
      },
      successRate: {
        legacy: legacy?.success ? 1 : 0,
        multiAgent: multiAgent?.success ? 1 : 0
      },
      errorCount: {
        legacy: legacy?.errors?.length || 0,
        multiAgent: multiAgent?.errors?.length || 0
      },
      stepsCount: {
        legacy: legacy?.steps || 0,
        multiAgent: multiAgent?.steps || 0
      }
    };
  }

  private determineWinner(results: ComparisonResult): 'legacy' | 'multiAgent' | 'tie' {
    const { legacy, multiAgent } = results;
    
    if (!legacy && !multiAgent) return 'tie';
    if (!legacy) return 'multiAgent';
    if (!multiAgent) return 'legacy';
    
    // Priority: Success > Speed > Fewer Errors
    if (legacy.success && !multiAgent.success) return 'legacy';
    if (multiAgent.success && !legacy.success) return 'multiAgent';
    
    if (legacy.success && multiAgent.success) {
      // Both successful, compare other metrics
      if (Math.abs(legacy.duration - multiAgent.duration) < 1000) {
        return 'tie'; // Similar performance
      }
      return legacy.duration < multiAgent.duration ? 'legacy' : 'multiAgent';
    }
    
    // Both failed, check which had fewer errors
    const legacyErrors = legacy.errors?.length || 0;
    const multiAgentErrors = multiAgent.errors?.length || 0;
    
    if (legacyErrors < multiAgentErrors) return 'legacy';
    if (multiAgentErrors < legacyErrors) return 'multiAgent';
    
    return 'tie';
  }

  private generateRecommendation(results: ComparisonResult): string {
    const winner = results.winner;
    
    if (winner === 'multiAgent') {
      return 'Multi-agent system shows better performance. Consider migrating this workflow.';
    } else if (winner === 'legacy') {
      return 'Legacy system performed better. Investigate multi-agent system optimization.';
    } else {
      return 'Both systems performed similarly. Migration is low risk.';
    }
  }

  private generateMigrationReport(results: ComparisonResult[], errors: string[]): MigrationReport {
    const totalScenarios = results.length;
    const multiAgentWins = results.filter(r => r.winner === 'multiAgent').length;
    const legacyWins = results.filter(r => r.winner === 'legacy').length;
    const ties = results.filter(r => r.winner === 'tie').length;
    
    const successRate = {
      legacy: results.filter(r => r.legacy?.success).length / totalScenarios,
      multiAgent: results.filter(r => r.multiAgent?.success).length / totalScenarios
    };
    
    const avgExecutionTime = {
      legacy: results.reduce((sum, r) => sum + (r.legacy?.duration || 0), 0) / totalScenarios,
      multiAgent: results.reduce((sum, r) => sum + (r.multiAgent?.duration || 0), 0) / totalScenarios
    };
    
    let recommendation = '';
    if (multiAgentWins > legacyWins) {
      recommendation = 'RECOMMEND MIGRATION: Multi-agent system shows superior performance';
    } else if (legacyWins > multiAgentWins) {
      recommendation = 'DELAY MIGRATION: Legacy system performs better, needs investigation';
    } else {
      recommendation = 'NEUTRAL: Both systems perform similarly, migration is low risk';
    }
    
    return {
      totalScenarios,
      results,
      errors,
      summary: {
        multiAgentWins,
        legacyWins,
        ties,
        successRate,
        avgExecutionTime
      },
      recommendation,
      generatedAt: new Date()
    };
  }

  private validateConfiguration(): string[] {
    const issues: string[] = [];
    
    // Check for configuration compatibility
    if (!this.config.variables && this.legacy) {
      issues.push('Variables not configured for comparison');
    }
    
    return issues;
  }

  private calculateReadinessScore(assessment: MigrationReadiness): number {
    let score = 100;
    
    // Deduct points for blockers (critical)
    score -= assessment.blockers.length * 30;
    
    // Deduct points for warnings (moderate)
    score -= assessment.warnings.length * 10;
    
    return Math.max(0, score);
  }

  private generateMigrationRecommendations(assessment: MigrationReadiness): string[] {
    const recommendations: string[] = [];
    
    if (assessment.score < 50) {
      recommendations.push('Address all blockers before attempting migration');
    }
    
    if (assessment.score < 80) {
      recommendations.push('Start with low-risk scenarios');
      recommendations.push('Use gradual rollout approach');
    }
    
    recommendations.push('Test in development environment first');
    recommendations.push('Monitor performance metrics during migration');
    recommendations.push('Have rollback plan ready');
    
    return recommendations;
  }

  private shouldUseMultiAgent(config: FeatureFlagConfig): boolean {
    if (config.forceMultiAgent) return true;
    if (config.forceLegacy) return false;
    
    // Random rollout based on percentage
    return Math.random() < (config.rolloutPercentage / 100);
  }

  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Types for migration service

export interface MigrationConfig {
  variables?: Variable[];
  timeout?: number;
  reporterName?: string;
}

export interface ComparisonOptions {
  executeLegacy?: boolean;
  executeMultiAgent?: boolean;
  timeout?: number;
}

export interface ExecutionResult {
  system: 'legacy' | 'multiAgent';
  success: boolean;
  duration: number;
  steps: number;
  errors: string[];
  result: any;
  error?: string;
}

export interface ComparisonResult {
  goal: string;
  startTime: Date;
  legacy: ExecutionResult | null;
  multiAgent: ExecutionResult | null;
  winner: 'legacy' | 'multiAgent' | 'tie' | null;
  recommendation: string;
  metrics: ComparisonMetrics;
}

export interface ComparisonMetrics {
  executionTime: { legacy: number; multiAgent: number };
  successRate: { legacy: number; multiAgent: number };
  errorCount: { legacy: number; multiAgent: number };
  stepsCount: { legacy: number; multiAgent: number };
}

export interface MigrationScenario {
  name: string;
  goal: string;
  options?: ComparisonOptions;
  delay?: number; // ms to wait after execution
}

export interface MigrationReport {
  totalScenarios: number;
  results: ComparisonResult[];
  errors: string[];
  summary: {
    multiAgentWins: number;
    legacyWins: number;
    ties: number;
    successRate: { legacy: number; multiAgent: number };
    avgExecutionTime: { legacy: number; multiAgent: number };
  };
  recommendation: string;
  generatedAt: Date;
}

export interface MigrationReadiness {
  ready: boolean;
  score: number; // 0-100
  blockers: string[];
  warnings: string[];
  recommendations: string[];
}

export interface FeatureFlagConfig {
  rolloutPercentage: number; // 0-100
  comparisonMode?: boolean;
  forceMultiAgent?: boolean;
  forceLegacy?: boolean;
}

export interface FeatureFlags {
  useMultiAgent: boolean;
  enableComparison: boolean;
  rolloutPercentage: number;
  shouldUseLegacy: () => boolean;
  logDecision: (decision: string, reason: string) => void;
}