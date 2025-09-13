import { LLM } from '../../interfaces/llm.interface';
import { Browser } from '../../interfaces/browser.interface';
import { ITaskExecutor, ExecutorInput, ExecutorOutput } from '../../interfaces/agent.interface';
import { ExecutorConfig, PageState } from '../../types/agent-types';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { TASK_EXECUTOR_PROMPT } from './task-executor.prompt';
import { MicroActionData } from '@/core/value-objects/task';
import { DomService } from '@/infra/services/dom-service';

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
  public readonly maxRetries: number;

  private llm: LLM;
  private browser: Browser;
  private domService: DomService;

  constructor(llm: LLM, browser: Browser, domService: DomService, config: ExecutorConfig) {
    this.llm = llm;
    this.browser = browser;
    this.maxRetries = config.maxRetries || 3;
    this.domService = domService;
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

      const microActions = await this.decomposeStrategicStep(
        input.expectedOutcome,
        stringifiedDomState,
        {
          screenshot,
          pristineScreenshot,
          pixelAbove,
          pixelBelow
        },
        input.memoryLearnings
      );
      
      console.log(`🔍 Decomposed into ${microActions.length} micro-actions`);

      // Return decomposition result without execution
      const output: ExecutorOutput = {
        taskId: "",
        microActions,
        finalState: await this.captureCurrentState(),
        timestamp: new Date()
      };

      if (!this.validateOutput(output)) {
        throw new Error('Generated invalid executor output');
      }

      return output;

    } catch (error) {
      throw new Error(`Task decomposition failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  private async captureCurrentState(): Promise<PageState> {
    const { screenshot, pristineScreenshot, pixelAbove, pixelBelow } = await this.domService.getInteractiveElements();

    return {
      url: this.browser.getPageUrl(),
      title: await this.browser.getPage().title(),
      visibleSections: [],
      availableActions: [],
      extractedData: {},
      screenshot,
      pristineScreenshot,
      pixelAbove,
      pixelBelow
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