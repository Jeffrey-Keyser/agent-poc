import { StateManager } from '../services/state-manager';
import { MemoryService } from '../services/memory-service';
import { Browser } from '../interfaces/browser.interface';
import { DomService } from '../../infra/services/dom-service';
import { EnhancedEventBusInterface } from '../interfaces/event-bus.interface';
import { AgentReporter } from '../interfaces/agent-reporter.interface';
import { MemoryRepository } from '../repositories/memory-repository';
import { Workflow, Plan } from '../entities';

export interface StateContext {
  currentUrl: string;
  pageHtml: string;
  extractedData: Record<string, any>;
  interactions: string[];
}

export class WorkflowStateCoordinator {
  private stateManager: StateManager;
  private memoryService: MemoryService;
  private extractedData: Record<string, any> = {};
  private stateHistory: StateContext[] = [];
  
  constructor(
    private browser: Browser,
    domService: DomService,
    memoryRepository: MemoryRepository,
    private eventBus: EnhancedEventBusInterface,
    private reporter: AgentReporter
  ) {
    this.stateManager = new StateManager(browser, domService);
    this.memoryService = new MemoryService(eventBus, memoryRepository);
    this.setupStateListeners();
  }

  /**
   * Setup state change listeners
   */
  private setupStateListeners(): void {
    this.stateManager.on('state:captured', (state) => {
      this.handleStateChange(state);
    });
    
    this.stateManager.on('data:extracted', (data) => {
      this.handleDataExtraction(data);
    });
  }

  /**
   * Handle state changes
   */
  private handleStateChange(state: any): void {
    const context: StateContext = {
      currentUrl: state.url || '',
      pageHtml: state.html || '',
      extractedData: { ...this.extractedData },
      interactions: state.interactions || []
    };
    
    this.stateHistory.push(context);
    this.eventBus.emit('state:captured', context);
    
    // Analyze if state change requires replanning
    if (this.isUnexpectedStateChange(state)) {
      this.eventBus.emit('state:captured', {
        expected: this.getExpectedState(),
        actual: state
      });
    }
  }

  /**
   * Handle data extraction
   */
  private handleDataExtraction(data: any): void {
    this.extractedData = { ...this.extractedData, ...data.extractedData };
    this.reporter.log(`📊 Data extracted: ${Object.keys(data.extractedData || {}).join(', ')}`);
  }

  /**
   * Initialize state for workflow
   */
  async initializeState(startUrl?: string): Promise<void> {
    if (startUrl) {
      await this.navigateTo(startUrl);
    }
    
    const currentState = await this.getCurrentPageState();
    this.handleStateChange(currentState);
  }

  /**
   * Navigate to a URL
   */
  async navigateTo(url: string): Promise<void> {
    // First ensure browser is launched with the URL
    try {
      // Try to launch the browser with the URL (this will work if not yet launched)
      await this.browser.launch(url);
    } catch (error) {
      // If already launched, just navigate to the URL
      try {
        await this.browser.goToUrl(url);
      } catch (navError) {
        this.reporter.log(`⚠️ Navigation failed, attempting to relaunch browser: ${navError}`);
        // As a fallback, try to launch again
        await this.browser.launch(url);
      }
    }
    
    // Capture state after navigation
    await this.stateManager.captureState();
  }

  /**
   * Get current page state
   */
  async getCurrentPageState(): Promise<any> {
    const currentState = this.stateManager.getCurrentState();
    if (currentState) {
      return {
        url: currentState.url,
        html: '', // PageState doesn't expose HTML directly
        extractedData: currentState.extractedData,
        interactions: []
      };
    }
    
    // Capture new state if none exists
    const state = await this.stateManager.captureState();
    return {
      url: state.url,
      html: '', 
      extractedData: state.extractedData,
      interactions: []
    };
  }

  /**
   * Update memory with workflow results
   */
  async updateMemory(
    workflow: Workflow,
    plan: Plan,
    success: boolean,
    extractedData: Record<string, any>
  ): Promise<void> {
    const context = {
      url: this.getCurrentContext().currentUrl,
      taskGoal: workflow.goal,
      pageSection: 'workflow-execution'
    };

    if (success) {
      await this.memoryService.learnFromSuccess(
        context,
        `Executed workflow plan with ${plan.getSteps().length} steps`,
        `Successfully extracted: ${Object.keys(extractedData).join(', ')}`
      );
    } else {
      await this.memoryService.learnFromFailure(
        context,
        `Workflow execution`,
        'Workflow failed to complete successfully'
      );
    }
  }

  /**
   * Get relevant memory for planning
   */
  async getRelevantMemory(goal: string): Promise<any> {
    const context = {
      url: this.getCurrentContext().currentUrl,
      taskGoal: goal
    };
    
    const memories = await this.memoryService.getRelevantMemories(context);
    const memoryPrompt = await this.memoryService.getMemoryPrompt(context);
    
    return {
      relevantPlans: memories,
      memoryPrompt
    };
  }

  /**
   * Check if state change is unexpected
   */
  private isUnexpectedStateChange(state: any): boolean {
    const expectedPatterns = [
      'loading',
      'navigation',
      'form submission',
      'data update'
    ];
    
    // Simple heuristic - can be made more sophisticated
    return !expectedPatterns.some(pattern => 
      state.changeType?.includes(pattern)
    );
  }

  /**
   * Get expected state based on plan
   */
  private getExpectedState(): any {
    // Return the expected state based on current plan step
    return {
      url: this.stateHistory[this.stateHistory.length - 1]?.currentUrl,
      hasData: Object.keys(this.extractedData).length > 0
    };
  }

  /**
   * Get current state context
   */
  getCurrentContext(): StateContext {
    return this.stateHistory[this.stateHistory.length - 1] || {
      currentUrl: '',
      pageHtml: '',
      extractedData: {},
      interactions: []
    };
  }

  /**
   * Get all extracted data
   */
  getExtractedData(): Record<string, any> {
    return { ...this.extractedData };
  }

  /**
   * Get state manager for direct access
   */
  getStateManager(): StateManager {
    return this.stateManager;
  }

  /**
   * Get memory service for direct access
   */
  getMemoryService(): MemoryService {
    return this.memoryService;
  }

  /**
   * Reset state
   */
  reset(): void {
    this.extractedData = {};
    this.stateHistory = [];
    this.stateManager.clearHistory();
    this.stateManager.clearAllExtractedData();
  }
}