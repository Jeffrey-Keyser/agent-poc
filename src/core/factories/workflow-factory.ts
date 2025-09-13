import { Browser } from '../interfaces/browser.interface';
import { AgentReporter } from '../interfaces/agent-reporter.interface';
import { EnhancedEventBusInterface } from '../interfaces/event-bus.interface';
import { WorkflowManager } from '../services/workflow-manager';
import { DomService } from '@/infra/services/dom-service';
import { Variable } from '../value-objects';
import { WorkflowManagerBuilder } from './workflow-manager-builder';
import { InitMultiAgentConfig } from '@/init-multi-agent';

/**
 * Infrastructure components bundle
 */
interface Infrastructure {
  eventBus: EnhancedEventBusInterface;
  browser: Browser;
  domService: DomService;
  reporter: AgentReporter;
}

/**
 * Simplified factory for creating WorkflowManager instances using the new builder pattern
 * 
 * This factory replaces the complex constructor with the WorkflowManagerBuilder pattern
 * that ensures all services are properly configured and injected.
 */
export class WorkflowFactory {
  
  /**
   * Main factory method for creating a fully configured WorkflowManager
   * 
   * @param config Simplified configuration object
   * @returns Configured WorkflowManager instance
   */
  static create(
    config: InitMultiAgentConfig, 
    infrastructure: Infrastructure
  ): WorkflowManager {
    // Convert config variables to Variable value objects
    const variables: Variable[] = (config.variables || []).map(variable => 
      typeof variable === 'string' 
        ? new Variable({ name: variable, value: '', isSecret: false })
        : variable
    );
    
    // Use the WorkflowManagerBuilder to construct the WorkflowManager
    return new WorkflowManagerBuilder()
      .withLLM(config.llm)
      .withBrowser(infrastructure.browser)
      .withEventBus(infrastructure.eventBus)
      .withReporter(infrastructure.reporter)
      .withDomService(infrastructure.domService)
      .withRetryConfig(config.maxRetries || 3, config.timeout || 300000)
      .withLogging(config.verbose || false)
      .withVariables(variables)
      .build();
  }
}