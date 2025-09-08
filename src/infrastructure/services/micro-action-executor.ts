import { Browser } from '../../core/interfaces/browser.interface';
import { DomService, isTextNode } from '../../infra/services/dom-service';
import { MicroAction } from '../../core/value-objects/task';
import { ActionResult } from '../../core/types/agent-types';
import { VariableString } from '../../core/value-objects/variable-string';
import { VariableManager } from '../../core/services/variable-manager';

/**
 * MicroActionExecutor Service
 * 
 * Infrastructure service responsible for executing micro-level browser actions.
 * This service encapsulates all browser/DOM interaction logic for executing
 * individual MicroAction value objects.
 * 
 * Key responsibilities:
 * - Execute atomic browser actions (click, fill, scroll, etc.)
 * - Handle DOM element interaction via DomService
 * - Extract data from page elements
 * - Return detailed execution results
 * 
 * This service is infrastructure-layer because it deals directly with
 * browser automation, which is an infrastructure concern.
 */
export class MicroActionExecutor {
  constructor(
    private readonly browser: Browser,
    private readonly domService: DomService,
    private readonly variableManager?: VariableManager
  ) {}

  /**
   * Execute a single micro action and return the result
   */
  async execute(action: MicroAction): Promise<ActionResult> {
    const startTime = Date.now();
    
    console.log(`🔍 Executing micro-action: ${action.toString()}`);

    try {
      // Route to the appropriate execution method based on action type
      switch (action.getType()) {
        case 'click':
          return await this.executeClick(action, startTime);
        
        case 'fill':
          return await this.executeFill(action, startTime);
        
        case 'press_key':
          return await this.executePressKey(action, startTime);
        
        case 'scroll':
          return await this.executeScroll(action, startTime);
        
        case 'wait':
          return await this.executeWait(action, startTime);
        
        case 'extract':
          return await this.executeExtract(action, startTime);
        
        case 'extract_url':
          return await this.executeExtractUrl(action, startTime);
        
        case 'extract_href':
          return await this.executeExtractHref(action, startTime);
        
        case 'clear':
          return await this.executeClear(action, startTime);
        
        case 'hover':
          return await this.executeHover(action, startTime);
        
        case 'select_option':
          return await this.executeSelectOption(action, startTime);
        
        case 'wait_for_element':
          return await this.executeWaitForElement(action, startTime);
        
        case 'drag':
          return await this.executeDrag(action, startTime);
        
        default:
          throw new Error(`Unknown action type: ${action.getType()}`);
      }
    } catch (error) {
      return this.createErrorResult(action, error, startTime);
    }
  }

  /**
   * Execute click action
   */
  private async executeClick(action: MicroAction, startTime: number): Promise<ActionResult> {
    const elementIndex = action.getElementIndex();
    
    if (elementIndex === undefined) {
      throw new Error('No element index provided for click action');
    }

    const coordinates = this.domService.getIndexSelector(elementIndex);
    if (!coordinates) {
      throw new Error(`Index or coordinates not found for element index ${elementIndex}`);
    }

    await this.domService.resetHighlightElements();
    await this.domService.highlightElementPointer(coordinates);
    await this.browser.mouseClick(coordinates.x, coordinates.y);
    await this.domService.resetHighlightElements();
    
    return this.createSuccessResult(action, startTime);
  }

  /**
   * Execute fill action
   */
  private async executeFill(action: MicroAction, startTime: number): Promise<ActionResult> {
    const elementIndex = action.getElementIndex();
    const value = action.getValue();
    
    if (elementIndex === undefined || value === undefined) {
      throw new Error('Element index or value missing for fill action');
    }

    const coordinates = this.domService.getIndexSelector(elementIndex);
    if (!coordinates) {
      throw new Error(`Index or coordinates not found for element index ${elementIndex}`);
    }

    await this.domService.highlightElementPointer(coordinates);
    
    // Use VariableString for interpolation if variableManager is available
    const interpolatedValue = this.variableManager 
      ? new VariableString(String(value), Array.from(this.variableManager.getVariables().values()))
      : new VariableString(String(value), []);
    
    await this.browser.fillInput(interpolatedValue, coordinates);
    await this.domService.resetHighlightElements();
    
    return this.createSuccessResult(action, startTime);
  }

  /**
   * Execute press key action
   */
  private async executePressKey(action: MicroAction, startTime: number): Promise<ActionResult> {
    const key = action.getKey();
    
    if (!key) {
      throw new Error('No key specified for press_key action');
    }

    const page = this.browser.getPage();
    await page.keyboard.press(key);
    
    return this.createSuccessResult(action, startTime);
  }

  /**
   * Execute scroll action
   */
  private async executeScroll(action: MicroAction, startTime: number): Promise<ActionResult> {
    const direction = action.getValue() || 'down';
    
    if (direction === 'down') {
      await this.browser.scrollDown();
    } else {
      await this.browser.scrollUp();
    }
    
    return this.createSuccessResult(action, startTime);
  }

  /**
   * Execute wait action
   */
  private async executeWait(action: MicroAction, startTime: number): Promise<ActionResult> {
    const duration = action.getTimeout() || Number(action.getValue()) || 1000;
    await this.wait(duration);
    
    return this.createSuccessResult(action, startTime);
  }

  /**
   * Execute extract action
   */
  private async executeExtract(action: MicroAction, startTime: number): Promise<ActionResult> {
    const elementIndex = action.getElementIndex();
    let extractedValue: any = null;
    
    if (elementIndex !== undefined) {
      // Element-specific extraction
      const { selectorMap } = await this.domService.getInteractiveElements();
      const element = selectorMap[elementIndex];
      
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
        
        console.log(`📝 Extracted from element ${elementIndex}: ${extractedValue?.substring(0, 100)}...`);
      }
    } else {
      // No element index provided - skip extraction
      console.log(`⚠️ Skipping extraction action without element index: ${action.getDescription()}`);
    }
    
    return {
      ...this.createSuccessResult(action, startTime),
      extractedValue
    };
  }

  /**
   * Execute extract URL action
   */
  private async executeExtractUrl(action: MicroAction, startTime: number): Promise<ActionResult> {
    const currentUrl = this.browser.getPageUrl();
    console.log(`🔗 Extracted current page URL: ${currentUrl}`);
    
    return {
      ...this.createSuccessResult(action, startTime),
      extractedValue: currentUrl
    };
  }

  /**
   * Execute extract href action
   */
  private async executeExtractHref(action: MicroAction, startTime: number): Promise<ActionResult> {
    const elementIndex = action.getElementIndex();
    let hrefValue: string | null = null;
    
    if (elementIndex !== undefined) {
      const { selectorMap } = await this.domService.getInteractiveElements();
      const element = selectorMap[elementIndex];
      
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
        
        console.log(`🔗 Extracted href from element ${elementIndex}: ${hrefValue}`);
      }
    } else {
      console.log(`⚠️ No element index provided for extract_href action`);
    }
    
    return {
      ...this.createSuccessResult(action, startTime),
      extractedValue: hrefValue
    };
  }

  /**
   * Execute clear action
   */
  private async executeClear(action: MicroAction, startTime: number): Promise<ActionResult> {
    const elementIndex = action.getElementIndex();
    
    if (elementIndex === undefined) {
      throw new Error('Element index missing for clear action');
    }

    const coordinates = this.domService.getIndexSelector(elementIndex);
    if (!coordinates) {
      throw new Error(`Coordinates not found for element index ${elementIndex}`);
    }

    await this.domService.resetHighlightElements();
    await this.domService.highlightElementPointer(coordinates);
    await this.browser.clearInput(coordinates);
    await this.domService.resetHighlightElements();
    
    return this.createSuccessResult(action, startTime);
  }

  /**
   * Execute hover action
   */
  private async executeHover(action: MicroAction, startTime: number): Promise<ActionResult> {
    const elementIndex = action.getElementIndex();
    
    if (elementIndex === undefined) {
      throw new Error('Element index missing for hover action');
    }

    const coordinates = this.domService.getIndexSelector(elementIndex);
    if (!coordinates) {
      throw new Error(`Coordinates not found for element index ${elementIndex}`);
    }

    await this.domService.resetHighlightElements();
    await this.domService.highlightElementPointer(coordinates);
    await this.browser.hover(coordinates);
    await this.domService.resetHighlightElements();
    
    return this.createSuccessResult(action, startTime);
  }

  /**
   * Execute select option action
   */
  private async executeSelectOption(action: MicroAction, startTime: number): Promise<ActionResult> {
    const elementIndex = action.getElementIndex();
    const options = action.getOptions();
    
    if (elementIndex === undefined || !options || options.length === 0) {
      throw new Error('Element index or options missing for select_option action');
    }

    const coordinates = this.domService.getIndexSelector(elementIndex);
    if (!coordinates) {
      throw new Error(`Coordinates not found for element index ${elementIndex}`);
    }

    await this.domService.resetHighlightElements();
    await this.domService.highlightElementPointer(coordinates);
    await this.browser.selectOption(coordinates, options);
    await this.domService.resetHighlightElements();
    
    return this.createSuccessResult(action, startTime);
  }

  /**
   * Execute wait for element action
   */
  private async executeWaitForElement(action: MicroAction, startTime: number): Promise<ActionResult> {
    const elementIndex = action.getElementIndex();
    
    if (elementIndex === undefined) {
      throw new Error('Element index missing for wait_for_element action');
    }

    const { selectorMap } = await this.domService.getInteractiveElements();
    const element = selectorMap[elementIndex];
    
    if (!element || isTextNode(element) || !element.xpath) {
      throw new Error(`Element not found or has no xpath for index ${elementIndex}`);
    }

    // Convert XPath to CSS selector if possible, or use XPath directly
    const selector = element.xpath;
    await this.browser.waitForElement(
      selector,
      action.getWaitCondition() || 'visible',
      action.getTimeout() || 5000
    );
    
    return this.createSuccessResult(action, startTime);
  }

  /**
   * Execute drag action
   */
  private async executeDrag(action: MicroAction, startTime: number): Promise<ActionResult> {
    const startIndex = action.getStartIndex();
    const endIndex = action.getEndIndex();
    
    if (startIndex === undefined || endIndex === undefined) {
      throw new Error('Start or end index missing for drag action');
    }

    const startCoords = this.domService.getIndexSelector(startIndex);
    const endCoords = this.domService.getIndexSelector(endIndex);
    
    if (!startCoords || !endCoords) {
      throw new Error(`Coordinates not found for drag action (start: ${startIndex}, end: ${endIndex})`);
    }

    await this.domService.resetHighlightElements();
    await this.domService.highlightElementPointer(startCoords);
    await this.browser.drag(startCoords, endCoords);
    await this.domService.resetHighlightElements();
    
    return this.createSuccessResult(action, startTime);
  }

  /**
   * Helper method to wait for a duration
   */
  private async wait(duration: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  /**
   * Create a success result for an action
   */
  private createSuccessResult(action: MicroAction, startTime: number): ActionResult {
    return {
      action: action.toObject(), // Convert to plain object for compatibility
      success: true,
      duration: Date.now() - startTime,
      timestamp: new Date()
    };
  }

  /**
   * Create an error result for an action
   */
  private createErrorResult(action: MicroAction, error: unknown, startTime: number): ActionResult {
    return {
      action: action.toObject(), // Convert to plain object for compatibility
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
      timestamp: new Date()
    };
  }
}