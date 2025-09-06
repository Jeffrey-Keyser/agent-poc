import { LLM } from '../../interfaces/llm.interface';
import { Browser } from '../../interfaces/browser.interface';
import { ITaskExecutor, ExecutorInput, ExecutorOutput } from '../../interfaces/agent.interface';
import { ExecutorConfig, MicroAction, ActionResult } from '../../types/agent-types';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { TASK_EXECUTOR_PROMPT } from './task-executor.prompt';
import { DomService, isTextNode } from '../../../infra/services/dom-service';
import { VariableString } from '../../value-objects/variable-string';

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

  constructor(llm: LLM, browser: Browser, domService: DomService, config: ExecutorConfig) {
    this.llm = llm;
    this.browser = browser;
    this.domService = domService;
    this.model = config.model;
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * Execute a strategic task by decomposing into micro-actions
   */
  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    if (!this.validateInput(input)) {
      throw new Error('Invalid executor input provided');
    }

    const strategicTask = input.task;
    try {
      // MODIFIED: Get full DOM state with screenshots
      const {
        stringifiedDomState,
        screenshot,
        pristineScreenshot,
        pixelAbove,
        pixelBelow
      } = await this.domService.getInteractiveElements();

      // TODO: This should probably be split out
      const microActions = await this.decomposeStrategicStep(
        strategicTask, 
        stringifiedDomState,
        { screenshot, pristineScreenshot, pixelAbove, pixelBelow },
        input.memoryLearnings,
      );
      
      console.log(`🔍 Decomposed micro-actions: ${JSON.stringify(microActions)}`);

      // Execute each micro-action sequentially  
      const results: ActionResult[] = [];
      const extractedData: Record<string, any> = {}; // Collect extracted data

      for (const action of microActions) {
        try {
          const actionResult = await this.executeMicroAction(action);
          results.push(actionResult);

          // If action failed, stop execution
          if (!actionResult.success) {
            break;
          }

          // Collect extracted data if present
          if ((action.type === 'extract' || action.type === 'extract_url' || action.type === 'extract_href') && actionResult.extractedValue !== null) {
            const key = action.description || `element_${action.elementIndex || Date.now()}`;
            extractedData[key] = actionResult.extractedValue;
            console.log(`💾 Stored extracted data with key: ${key}`);
          }

          // Refresh page state after significant actions
          if (this.shouldRefreshState(action)) {
            await this.wait(500); // Brief wait for page updates
            // DOM state could be refreshed here for subsequent actions if needed
          }

        } catch (error) {
          results.push({
            action,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date(),
            duration: 0
          });
          break; // Stop execution on error
        }
      }

      // Capture final state with extracted data
      const finalState = await this.captureCurrentState(extractedData);

      const output: ExecutorOutput = {
        taskId: strategicTask.id,
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
      input.task &&
      typeof input.task.id === 'string' &&
      input.pageState &&
      typeof input.pageState.url === 'string'
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
    strategicTask: any, 
    stringifiedDomState: string,
    visualContext?: {
      screenshot?: string;
      pristineScreenshot?: string;
      pixelAbove?: number;
      pixelBelow?: number;
    },
    memoryLearnings?: string, // NEW parameter
  ): Promise<MicroAction[]> {
    const systemMessage = new SystemMessage({ content: TASK_EXECUTOR_PROMPT });
    
    const userPrompt = `
${memoryLearnings ? `${memoryLearnings}\n` : ''}

STRATEGIC TASK TO EXECUTE:

Intent: ${strategicTask.intent}
Target Concept: ${strategicTask.targetConcept}
Expected Outcome: ${strategicTask.expectedOutcome}

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
   * Execute a single micro-action
   */
  private async executeMicroAction(action: MicroAction): Promise<ActionResult> {
    const startTime = Date.now();
    
    console.log(`🔍 Executing micro-action: ${JSON.stringify(action)}`);

    try {
      switch (action.type) {
        case 'click':
          if (action.elementIndex !== undefined) {
            const coordinates = this.domService.getIndexSelector(action.elementIndex);
            if (coordinates) {
              await this.domService.resetHighlightElements();
              await this.domService.highlightElementPointer(coordinates);
              await this.browser.mouseClick(coordinates.x, coordinates.y);
              await this.domService.resetHighlightElements();
              return this.createSuccessResult(action, startTime);
            } else {
              throw new Error(`Index or coordinates not found for element index ${action.elementIndex}`);
            }
          }
          throw new Error('No element index provided for click action');

        case 'fill':
          if (action.elementIndex !== undefined && action.value) {
            const coordinates = this.domService.getIndexSelector(action.elementIndex);
            if (coordinates) {
              await this.domService.highlightElementPointer(coordinates);
              const variableString = new VariableString(String(action.value), []);
              await this.browser.fillInput(variableString, coordinates);
              await this.domService.resetHighlightElements();
              return this.createSuccessResult(action, startTime);
            } else {
              throw new Error(`Index or coordinates not found for element index ${action.elementIndex}`);
            }
          }
          throw new Error('Element index or value missing for fill action');

        case 'press_key':
          if (action.key) {
            await this.pressKey(action.key);
            return this.createSuccessResult(action, startTime);
          }
          throw new Error('No key specified for press_key action');

        case 'scroll':
          const direction = action.value || 'down';
          if (direction === 'down') {
            await this.browser.scrollDown();
          } else {
            await this.browser.scrollUp();
          }
          return this.createSuccessResult(action, startTime);

        case 'wait':
          const duration = Number(action.value) || 1000;
          await this.wait(duration);
          return this.createSuccessResult(action, startTime);

        case 'extract':
          // Extract text content from the specified element only
          let extractedValue: any = null;
          
          if (action.elementIndex !== undefined) {
            // Element-specific extraction
            const { selectorMap } = await this.domService.getInteractiveElements();
            const element = selectorMap[action.elementIndex];
            
            if (element && !isTextNode(element)) {
              // Directly use the text property from ElementNode
              extractedValue = element.text?.trim() || null;
              
              // If no text in the element itself, try to get all text from children using xpath
              if (!extractedValue && element.xpath) {
                // Fallback: use xpath to query the element
                const page = this.browser.getPage();
                extractedValue = await page.evaluate((xpath: string) => {
                  const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                  const el = result.singleNodeValue as HTMLElement;
                  return el ? el.innerText?.trim() || null : null;
                }, element.xpath);
              }
              
              console.log(`📝 Extracted from element ${action.elementIndex}: ${extractedValue?.substring(0, 100)}...`);
            }
          } else {
            // No element index provided - skip extraction
            console.log(`⚠️ Skipping extraction action without element index: ${action.description}`);
            return {
              ...this.createSuccessResult(action, startTime),
              extractedValue: null
            };
          }
          
          return {
            ...this.createSuccessResult(action, startTime),
            extractedValue
          };

        case 'extract_url':
          // Extract the current page URL directly
          const currentUrl = this.browser.getPageUrl();
          console.log(`🔗 Extracted current page URL: ${currentUrl}`);
          return {
            ...this.createSuccessResult(action, startTime),
            extractedValue: currentUrl
          };

        case 'extract_href':
          // Extract href attribute from a link element
          let hrefValue: string | null = null;
          
          if (action.elementIndex !== undefined) {
            const { selectorMap } = await this.domService.getInteractiveElements();
            const element = selectorMap[action.elementIndex];
            
            if (element && !isTextNode(element)) {
              // First check if the element has an href attribute
              if (element.attributes?.href) {
                hrefValue = element.attributes.href;
              } else if (element.xpath) {
                // Fallback: use xpath to get href from the actual DOM element
                const page = this.browser.getPage();
                hrefValue = await page.evaluate((xpath: string) => {
                  const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                  const el = result.singleNodeValue as HTMLElement;
                  return el ? (el as HTMLAnchorElement).href || el.getAttribute('href') : null;
                }, element.xpath);
              }
              
              console.log(`🔗 Extracted href from element ${action.elementIndex}: ${hrefValue}`);
            }
          } else {
            console.log(`⚠️ No element index provided for extract_href action`);
          }
          
          return {
            ...this.createSuccessResult(action, startTime),
            extractedValue: hrefValue
          };

        case 'clear':
          if (action.elementIndex !== undefined) {
            const coordinates = this.domService.getIndexSelector(action.elementIndex);
            if (coordinates) {
              await this.domService.resetHighlightElements();
              await this.domService.highlightElementPointer(coordinates);
              await this.browser.clearInput(coordinates);
              await this.domService.resetHighlightElements();
              return this.createSuccessResult(action, startTime);
            } else {
              throw new Error(`Coordinates not found for element index ${action.elementIndex}`);
            }
          }
          throw new Error('Element index missing for clear action');

        case 'hover':
          if (action.elementIndex !== undefined) {
            const coordinates = this.domService.getIndexSelector(action.elementIndex);
            if (coordinates) {
              await this.domService.resetHighlightElements();
              await this.domService.highlightElementPointer(coordinates);
              await this.browser.hover(coordinates);
              await this.domService.resetHighlightElements();
              return this.createSuccessResult(action, startTime);
            } else {
              throw new Error(`Coordinates not found for element index ${action.elementIndex}`);
            }
          }
          throw new Error('Element index missing for hover action');

        case 'select_option':
          if (action.elementIndex !== undefined && action.options) {
            const coordinates = this.domService.getIndexSelector(action.elementIndex);
            if (coordinates) {
              await this.domService.resetHighlightElements();
              await this.domService.highlightElementPointer(coordinates);
              await this.browser.selectOption(coordinates, action.options);
              await this.domService.resetHighlightElements();
              return this.createSuccessResult(action, startTime);
            } else {
              throw new Error(`Coordinates not found for element index ${action.elementIndex}`);
            }
          }
          throw new Error('Element index or options missing for select_option action');

        case 'wait_for_element':
          if (action.elementIndex !== undefined) {
            const { selectorMap } = await this.domService.getInteractiveElements();
            const element = selectorMap[action.elementIndex];
            if (element && !isTextNode(element) && element.xpath) {
              // Convert XPath to CSS selector if possible, or use XPath directly
              const selector = element.xpath;
              await this.browser.waitForElement(
                selector,
                action.waitCondition || 'visible',
                action.timeout || 5000
              );
              return this.createSuccessResult(action, startTime);
            } else {
              throw new Error(`Element not found or has no xpath for index ${action.elementIndex}`);
            }
          }
          throw new Error('Element index missing for wait_for_element action');

        case 'drag':
          if (action.startIndex !== undefined && action.endIndex !== undefined) {
            const startCoords = this.domService.getIndexSelector(action.startIndex);
            const endCoords = this.domService.getIndexSelector(action.endIndex);
            if (startCoords && endCoords) {
              await this.domService.resetHighlightElements();
              await this.domService.highlightElementPointer(startCoords);
              await this.browser.drag(startCoords, endCoords);
              await this.domService.resetHighlightElements();
              return this.createSuccessResult(action, startTime);
            } else {
              throw new Error(`Coordinates not found for drag action (start: ${action.startIndex}, end: ${action.endIndex})`);
            }
          }
          throw new Error('Start or end index missing for drag action');

        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    } catch (error) {
      return {
        action,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }


  private async pressKey(key: string): Promise<void> {
    const page = this.browser.getPage();
    await page.keyboard.press(key);
  }

  private async wait(duration: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  private shouldRefreshState(action: MicroAction): boolean {
    // Refresh after actions that likely change the page
    return ['click', 'press_key'].includes(action.type);
  }

  private async captureCurrentState(extractedData?: Record<string, any>): Promise<any> {
    return {
      url: this.browser.getPageUrl(),
      title: await this.browser.getPage().title(),
      visibleSections: [], // Would implement semantic section detection
      availableActions: [], // Would implement action detection
      extractedData: extractedData || {}
    };
  }


  private parseMicroActions(actions: any[]): MicroAction[] {
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

  private createSuccessResult(action: MicroAction, startTime: number): ActionResult {
    return {
      action,
      success: true,
      duration: Date.now() - startTime,
      timestamp: new Date()
    };
  }

  /**
   * Recursively interpolate variables in object values
   */
  private interpolateObjectValues(obj: any, variableManager: any): any {
    if (typeof obj === 'string') {
      return variableManager.interpolate(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.interpolateObjectValues(item, variableManager));
    } else if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.interpolateObjectValues(value, variableManager);
      }
      return result;
    }
    return obj;
  }
}