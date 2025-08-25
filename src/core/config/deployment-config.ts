import { MultiAgentConfig } from '../types/agent-types';

/**
 * Deployment environment types
 */
export type DeploymentEnvironment = 'development' | 'testing' | 'staging' | 'production';

/**
 * Configuration presets for different deployment scenarios
 */
export interface DeploymentConfig extends Omit<MultiAgentConfig, 'llm' | 'apiKey'> {
  environment: DeploymentEnvironment;
  description: string;
  
  // Environment-specific settings
  headless: boolean;
  verbose?: boolean;
  timeout: number;
  maxRetries: number;
  
  // Model configuration optimized for environment
  models: {
    planner: string;
    executor: string;
    evaluator: string;
    errorHandler: string;
  };
  
  // Browser configuration
  browser?: {
    viewport: { width: number; height: number };
    userAgent?: string;
    slowMo?: number; // Milliseconds to slow down operations
  };
  
  // Monitoring and observability
  monitoring?: {
    enableDetailedLogging: boolean;
    enablePerformanceMetrics: boolean;
    enableScreenshots: boolean;
    screenshotOnFailure: boolean;
  };
  
  // Resource limits
  limits?: {
    maxConcurrentWorkflows: number;
    maxExecutionTime: number;
    maxMemoryUsage: number; // MB
  };
}

/**
 * Predefined deployment configurations
 */
export const DEPLOYMENT_CONFIGS: Record<DeploymentEnvironment, DeploymentConfig> = {
  development: {
    environment: 'development',
    description: 'Development environment with full debugging and monitoring',
    headless: false, // Visual feedback for debugging
    verbose: true,
    timeout: 600000, // 10 minutes - generous for debugging
    maxRetries: 5, // More retries for flaky dev environments
    variables: [],
    models: {
      planner: 'gpt-4o-mini',    // Fast, cost-effective for development
      executor: 'gpt-4o-mini',   // Fast iterations
      evaluator: 'gpt-4o-mini',  // Quick feedback
      errorHandler: 'gpt-4o-mini'
    },
    browser: {
      viewport: { width: 1280, height: 720 },
      slowMo: 100 // Slow down for easier observation
    },
    monitoring: {
      enableDetailedLogging: true,
      enablePerformanceMetrics: true,
      enableScreenshots: true,
      screenshotOnFailure: true
    },
    limits: {
      maxConcurrentWorkflows: 1, // Single workflow for debugging
      maxExecutionTime: 600000,  // 10 minutes
      maxMemoryUsage: 1024      // 1GB
    }
  },
  
  testing: {
    environment: 'testing',
    description: 'Testing environment optimized for automated testing and CI/CD',
    headless: true, // No UI needed for automated tests
    verbose: false, // Minimal logging for clean test output
    timeout: 180000, // 3 minutes - faster feedback for tests
    maxRetries: 3,
    variables: [],
    models: {
      planner: 'gpt-4o-mini',    // Consistent, reliable
      executor: 'gpt-4o-mini',   // Deterministic behavior
      evaluator: 'gpt-4o-mini',  // Binary decisions
      errorHandler: 'gpt-4o-mini'
    },
    browser: {
      viewport: { width: 1024, height: 768 },
      slowMo: 0 // Maximum speed for tests
    },
    monitoring: {
      enableDetailedLogging: false,
      enablePerformanceMetrics: true, // For test performance analysis
      enableScreenshots: false,
      screenshotOnFailure: true // Only on failure for debugging
    },
    limits: {
      maxConcurrentWorkflows: 3, // Parallel test execution
      maxExecutionTime: 180000,  // 3 minutes per test
      maxMemoryUsage: 512       // 512MB
    }
  },
  
  staging: {
    environment: 'staging',
    description: 'Staging environment mimicking production with monitoring',
    headless: true,
    verbose: false,
    timeout: 300000, // 5 minutes
    maxRetries: 3,
    variables: [],
    models: {
      planner: 'gpt-4o-mini',    // Production-ready models
      executor: 'gpt-4o-mini',   
      evaluator: 'gpt-4o-mini',  
      errorHandler: 'gpt-4o-mini'
    },
    browser: {
      viewport: { width: 1920, height: 1080 }, // Production-like resolution
      slowMo: 0
    },
    monitoring: {
      enableDetailedLogging: true, // Full monitoring for staging validation
      enablePerformanceMetrics: true,
      enableScreenshots: false,
      screenshotOnFailure: true
    },
    limits: {
      maxConcurrentWorkflows: 5,
      maxExecutionTime: 300000, // 5 minutes
      maxMemoryUsage: 2048     // 2GB
    }
  },
  
  production: {
    environment: 'production',
    description: 'Production environment optimized for performance and reliability',
    headless: true, // Always headless in production
    verbose: false, // Minimal logging for performance
    timeout: 300000, // 5 minutes
    maxRetries: 3,   // Conservative retries to avoid cascading failures
    variables: [],
    models: {
      planner: 'gpt-4o-mini',    // Cost-optimized for production scale
      executor: 'gpt-4o-mini',   // Efficient for high-frequency operations
      evaluator: 'gpt-4o-mini',  // Fast binary decisions
      errorHandler: 'gpt-4o-mini' // Quick retry decisions
    },
    browser: {
      viewport: { width: 1920, height: 1080 },
      slowMo: 0 // Maximum speed
    },
    monitoring: {
      enableDetailedLogging: false, // Only essential logs
      enablePerformanceMetrics: true, // For production monitoring
      enableScreenshots: false,       // No screenshots for performance
      screenshotOnFailure: false      // Use error logs instead
    },
    limits: {
      maxConcurrentWorkflows: 10, // Scale based on production needs
      maxExecutionTime: 300000,   // 5 minutes max
      maxMemoryUsage: 4096       // 4GB
    }
  }
};

/**
 * Get deployment configuration by environment
 */
export function getDeploymentConfig(environment: DeploymentEnvironment): DeploymentConfig {
  const config = DEPLOYMENT_CONFIGS[environment];
  if (!config) {
    throw new Error(`Unknown deployment environment: ${environment}`);
  }
  return { ...config }; // Return a copy to prevent mutations
}

/**
 * Create a custom deployment configuration by merging environment preset with overrides
 */
export function createCustomDeploymentConfig(
  baseEnvironment: DeploymentEnvironment,
  overrides: Partial<DeploymentConfig>
): DeploymentConfig {
  const baseConfig = getDeploymentConfig(baseEnvironment);
  
  return {
    ...baseConfig,
    ...overrides,
    // Deep merge for nested objects
    models: { ...baseConfig.models, ...overrides.models },
    browser: { 
      viewport: { width: 1280, height: 720 },
      ...baseConfig.browser, 
      ...overrides.browser 
    },
    monitoring: { 
      enableDetailedLogging: false,
      enablePerformanceMetrics: false,
      enableScreenshots: false,
      screenshotOnFailure: false,
      ...baseConfig.monitoring, 
      ...overrides.monitoring 
    },
    limits: { 
      maxConcurrentWorkflows: 1,
      maxExecutionTime: 300000,
      maxMemoryUsage: 512,
      ...baseConfig.limits, 
      ...overrides.limits 
    }
  };
}

/**
 * Validate deployment configuration
 */
export function validateDeploymentConfig(config: DeploymentConfig): void {
  const errors: string[] = [];
  
  // Validate timeout
  if (config.timeout <= 0) {
    errors.push('Timeout must be positive');
  }
  
  // Validate retries
  if (config.maxRetries < 1) {
    errors.push('Max retries must be at least 1');
  }
  
  // Validate models
  const requiredModels = ['planner', 'executor', 'evaluator', 'errorHandler'];
  for (const model of requiredModels) {
    if (!config.models[model as keyof typeof config.models]) {
      errors.push(`Missing model configuration: ${model}`);
    }
  }
  
  // Validate browser viewport
  if (config.browser?.viewport) {
    const { width, height } = config.browser.viewport;
    if (width <= 0 || height <= 0) {
      errors.push('Browser viewport dimensions must be positive');
    }
  }
  
  // Validate limits
  if (config.limits) {
    if (config.limits.maxConcurrentWorkflows <= 0) {
      errors.push('Max concurrent workflows must be positive');
    }
    if (config.limits.maxExecutionTime <= 0) {
      errors.push('Max execution time must be positive');
    }
    if (config.limits.maxMemoryUsage <= 0) {
      errors.push('Max memory usage must be positive');
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Invalid deployment configuration: ${errors.join(', ')}`);
  }
}

/**
 * Get recommended configuration based on use case
 */
export function getRecommendedConfig(useCase: 'web-scraping' | 'e-commerce' | 'social-media' | 'automation'): Partial<DeploymentConfig> {
  switch (useCase) {
    case 'web-scraping':
      return {
        timeout: 120000, // 2 minutes - fast scraping
        maxRetries: 2,   // Quick retries for rate limits
        browser: {
          viewport: { width: 1024, height: 768 }, // Smaller viewport for performance
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        models: {
          planner: 'gpt-4o-mini',
          executor: 'gpt-4o-mini',    // Fast DOM operations
          evaluator: 'gpt-4o-mini',   // Quick validation
          errorHandler: 'gpt-4o-mini'
        }
      };
      
    case 'e-commerce':
      return {
        timeout: 300000, // 5 minutes - complex purchase flows
        maxRetries: 3,
        browser: {
          viewport: { width: 1920, height: 1080 }, // Full desktop experience
        },
        models: {
          planner: 'gpt-4o-mini',     // Complex purchase planning
          executor: 'gpt-4o-mini',    // Careful form filling
          evaluator: 'gpt-4o-mini',   // Accurate validation
          errorHandler: 'gpt-4o-mini' // Smart retry logic
        }
      };
      
    case 'social-media':
      return {
        timeout: 180000, // 3 minutes - social interactions
        maxRetries: 2,   // Avoid spam detection
        browser: {
          viewport: { width: 1366, height: 768 }, // Common social media resolution
        },
        models: {
          planner: 'gpt-4o-mini',     // Creative content planning
          executor: 'gpt-4o-mini',    // Precise interactions
          evaluator: 'gpt-4o-mini',   // Content validation
          errorHandler: 'gpt-4o-mini'
        }
      };
      
    case 'automation':
      return {
        timeout: 600000, // 10 minutes - complex workflows
        maxRetries: 5,   // Robust retry logic
        browser: {
          viewport: { width: 1280, height: 720 },
        },
        models: {
          planner: 'gpt-4o-mini',     // Strategic automation planning
          executor: 'gpt-4o-mini',    // Reliable execution
          evaluator: 'gpt-4o-mini',   // Thorough validation
          errorHandler: 'gpt-4o-mini' // Smart error handling
        }
      };
      
    default:
      return {};
  }
}