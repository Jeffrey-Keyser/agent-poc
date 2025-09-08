import { LLM } from '../../interfaces/llm.interface';
import { Browser } from '../../interfaces/browser.interface';
import { ITaskExecutor, ExecutorInput, ExecutorOutput } from '../../interfaces/agent.interface';
import { ExecutorConfig, ActionResult, PageState } from '../../types/agent-types';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { TASK_EXECUTOR_PROMPT } from './task-executor.prompt';
import { DomService } from '../../../infra/services/dom-service';
import { MicroActionExecutor } from '../../../infrastructure/services/micro-action-executor';
import { MicroAction, MicroActionData } from '@/core/value-objects/task';

/**
 * TaskExecutorAgent - Executes strategic tasks by decomposing them into micro-actions
 * 
 * This agent receives strategic tasks and current DOM state, then:
 * 1. Analyzes the strategic intent and target concept
 * 2. Finds appropriate elements from current page state
 * 3. Decomposes into precise micro-actions
 * 4. Executes each micro-action sequentially
 * 
 * Key principles:
 * - Uses runtime DOM discovery (no hardcoded selectors)
 * - Executes atomic micro-actions one by one
 * - Adapts to current page state dynamically
 * - Provides detailed execution results for evaluation
 */
export class TaskExecutorAgent implements ITaskExecutor {
  public readonly name = 'TaskExecutor';
  public readonly model: string;
  public readonly maxRetries: number;
  
  private llm: LLM;
  private browser: Browser;
  private domService: DomService;
  private microActionExecutor: MicroActionExecutor;

  constructor(llm: LLM, browser: Browser, domService: DomService, config: ExecutorConfig) {
    this.llm = llm;
    this.browser = browser;
    this.domService = domService;
    this.model = config.model;
    this.maxRetries = config.maxRetries || 3;
    this.microActionExecutor = new MicroActionExecutor(
      browser,
      domService,
      config.variableManager
    );
  }

  /**
   * Execute a strategic task by decomposing into micro-actions
   */
  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    if (!this.validateInput(input)) {
      throw new Error('Invalid executor input provided');
    }

    try {
      const {
        stringifiedDomState,
        screenshot,
        pristineScreenshot,
        pixelAbove,
        pixelBelow
      } = await this.domService.getInteractiveElements();

      // TODO: This should probably be split out
      const microActions = await this.decomposeStrategicStep(
        input.expectedOutcome, 
        stringifiedDomState,
        { screenshot, pristineScreenshot, pixelAbove, pixelBelow },
        input.memoryLearnings,
      );
      
      console.log(`🔍 Decomposed micro-actions: ${JSON.stringify(microActions)}`);

      // Execute each micro-action sequentially  
      const results: ActionResult[] = [];
      const extractedData: Record<string, any> = {}; // Collect extracted data

      for (const microActionData of microActions) {
        try {
          // Convert plain object to MicroAction value object
          const actionResult = MicroAction.create(microActionData);
          if (!actionResult.isSuccess()) {
            throw new Error(`Failed to create MicroAction: ${actionResult.getError()}`);
          }
          
          const action = actionResult.getValue();
          const executionResult = await this.microActionExecutor.execute(action);
          results.push(executionResult);

          // If action failed, stop execution
          if (!executionResult.success) {
            break;
          }

          // Collect extracted data if present
          if (action.isExtractionAction() && executionResult.extractedValue !== null) {
            const key = action.getDescription() || `element_${action.getElementIndex() || Date.now()}`;
            extractedData[key] = executionResult.extractedValue;
            console.log(`💾 Stored extracted data with key: ${key}`);
          }

          // Refresh page state after significant actions
          if (this.shouldRefreshState(action)) {
            await this.wait(500); // Brief wait for page updates
          }

        } catch (error) {
          results.push({
            action: microActionData,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date(),
            duration: 0
          });
          break;
        }
      }

      const finalState = await this.captureCurrentState(extractedData);

      const output: ExecutorOutput = {
        taskId: "",
        microActions,
        results,
        finalState,
        timestamp: new Date()
      };

      if (!this.validateOutput(output)) {
        throw new Error('Generated invalid executor output');
      }

      return output;

    } catch (error) {
      throw new Error(`Task execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  validateInput(input: ExecutorInput): boolean {
    return !!(
      input &&
      typeof input.expectedOutcome === 'string'
    );
  }

  validateOutput(output: ExecutorOutput): boolean {
    return !!(
      output &&
      typeof output.taskId === 'string' &&
      Array.isArray(output.microActions) &&
      Array.isArray(output.results) &&
      output.finalState &&
      output.timestamp instanceof Date
    );
  }

  /**
   * Decompose strategic step into micro-actions using LLM
   */
  private async decomposeStrategicStep(
    expectedOutcome: string, 
    stringifiedDomState: string,
    visualContext?: {
      screenshot?: string;
      pristineScreenshot?: string;
      pixelAbove?: number;
      pixelBelow?: number;
    },
    memoryLearnings?: string, // NEW parameter
  ): Promise<MicroActionData[]> {
    const systemMessage = new SystemMessage({ content: TASK_EXECUTOR_PROMPT });
    
    const userPrompt = `
${memoryLearnings ? `${memoryLearnings}\n` : ''}

STRATEGIC TASK TO EXECUTE:

Expected Outcome: ${expectedOutcome}

${visualContext?.pixelAbove ? `... ${visualContext.pixelAbove} PIXELS ABOVE - SCROLL UP TO SEE MORE` : ''}

CURRENT PAGE ELEMENTS:
${stringifiedDomState}

${visualContext?.pixelBelow ? `... ${visualContext.pixelBelow} PIXELS BELOW - SCROLL DOWN TO SEE MORE` : ''}

Based on the strategic intent and available elements, create a sequence of micro-actions.
Use the element indices from the DOM state above.
    `;

    // Build message with screenshots if available
    const messages = [systemMessage];
    
    if (visualContext?.screenshot && visualContext?.pristineScreenshot) {
      messages.push(new HumanMessage({
        content: [
          { type: 'text', text: userPrompt },
          { 
            type: 'image_url', 
            image_url: { url: visualContext.pristineScreenshot, detail: 'high' } 
          },
          { 
            type: 'image_url', 
            image_url: { url: visualContext.screenshot, detail: 'high' } 
          }
        ]
      }));
    } else {
      messages.push(new HumanMessage({ content: userPrompt }));
    }
    
    const parser = new JsonOutputParser<{ microActions: any[] }>();
    const response = await this.llm.invokeAndParse(messages, parser);
    
    return this.parseMicroActions(response.microActions);
  }

  /**
   * Check if page state should be refreshed after an action
   */
  private shouldRefreshState(action: MicroAction): boolean {
    return action.getType() === 'click' || action.getType() === 'press_key';
  }


  private async wait(duration: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  private async captureCurrentState(extractedData?: Record<string, any>): Promise<PageState> {
    return {
      url: this.browser.getPageUrl(),
      title: await this.browser.getPage().title(),
      visibleSections: [],
      availableActions: [],
      extractedData: extractedData || {}
    };
  }

  private parseMicroActions(actions: any[]): MicroActionData[] {
    return actions.map(action => ({
      type: action.type,
      elementIndex: action.elementIndex,
      value: action.value,
      key: action.key,
      description: action.description,
      options: action.options,
      waitCondition: action.waitCondition,
      timeout: action.timeout,
      startIndex: action.startIndex,
      endIndex: action.endIndex
    }));
  }

}