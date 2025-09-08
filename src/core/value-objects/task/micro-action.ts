import { Result } from '../web/url';
import { DOMElement } from '../../types/agent-types';

export type MicroActionType = 
  | 'click' 
  | 'fill' 
  | 'scroll' 
  | 'wait' 
  | 'extract' 
  | 'press_key'
  | 'clear' 
  | 'hover' 
  | 'select_option' 
  | 'wait_for_element' 
  | 'drag'
  | 'extract_url' 
  | 'extract_href';

export type WaitCondition = 'visible' | 'hidden' | 'attached' | 'detached';

export interface MicroActionData {
  type: MicroActionType;
  selector?: string;
  elementIndex?: number;
  value?: any;
  element?: DOMElement;
  description?: string;
  key?: string;
  options?: string[];
  waitCondition?: WaitCondition;
  timeout?: number;
  startIndex?: number;
  endIndex?: number;
}

/**
 * Value object representing a micro-level action in browser automation
 * These are tactical, runtime actions created by the executor
 */
export class MicroAction {
  private constructor(
    private readonly type: MicroActionType,
    private readonly selector?: string,
    private readonly elementIndex?: number,
    private readonly value?: any,
    private readonly element?: DOMElement,
    private readonly description?: string,
    private readonly key?: string,
    private readonly options?: string[],
    private readonly waitCondition?: WaitCondition,
    private readonly timeout?: number,
    private readonly startIndex?: number,
    private readonly endIndex?: number
  ) {}

  /**
   * Create a MicroAction from data object
   */
  static create(data: MicroActionData): Result<MicroAction> {
    // Validate required fields based on action type
    const validation = this.validateActionData(data);
    if (!validation.success) {
      return Result.fail(validation.error!);
    }

    return Result.ok(new MicroAction(
      data.type,
      data.selector,
      data.elementIndex,
      data.value,
      data.element,
      data.description,
      data.key,
      data.options,
      data.waitCondition,
      data.timeout,
      data.startIndex,
      data.endIndex
    ));
  }

  /**
   * Validate action data based on action type requirements
   */
  private static validateActionData(data: MicroActionData): { success: boolean; error?: string } {
    if (!data.type) {
      return { success: false, error: 'Action type is required' };
    }

    // Validate based on action type
    switch (data.type) {
      case 'click':
      case 'hover':
      case 'clear':
        if (!data.selector && data.elementIndex === undefined) {
          return { success: false, error: `${data.type} action requires selector or elementIndex` };
        }
        break;

      case 'fill':
        if ((!data.selector && data.elementIndex === undefined) || data.value === undefined) {
          return { success: false, error: 'Fill action requires selector/elementIndex and value' };
        }
        break;

      case 'press_key':
        if (!data.key) {
          return { success: false, error: 'Press key action requires key' };
        }
        break;

      case 'select_option':
        if ((!data.selector && data.elementIndex === undefined) || !data.options || data.options.length === 0) {
          return { success: false, error: 'Select option action requires selector/elementIndex and options' };
        }
        break;

      case 'wait_for_element':
        if (!data.selector) {
          return { success: false, error: 'Wait for element action requires selector' };
        }
        break;

      case 'drag':
        if (data.startIndex === undefined || data.endIndex === undefined) {
          return { success: false, error: 'Drag action requires startIndex and endIndex' };
        }
        break;

      case 'scroll':
      case 'wait':
      case 'extract':
      case 'extract_url':
      case 'extract_href':
        // These actions have optional parameters
        break;

      default:
        return { success: false, error: `Unknown action type: ${data.type}` };
    }

    return { success: true };
  }

  /**
   * Factory methods for common actions
   */
  static click(selector: string, elementIndex?: number, description?: string): Result<MicroAction> {
    return this.create({
      type: 'click',
      selector,
      elementIndex: elementIndex || 0,
      description: description || `Click on ${selector}`
    });
  }

  static fill(selector: string, value: any, elementIndex?: number, description?: string): Result<MicroAction> {
    return this.create({
      type: 'fill',
      selector,
      value,
      elementIndex: elementIndex || 0,
      description: description || `Fill ${selector} with value`
    });
  }

  static scroll(value?: any, description?: string): Result<MicroAction> {
    return this.create({
      type: 'scroll',
      value,
      description: description || 'Scroll page'
    });
  }

  static wait(timeout?: number, description?: string): Result<MicroAction> {
    return this.create({
      type: 'wait',
      timeout: timeout || 1000,
      description: description || `Wait for ${timeout || 1000}ms`
    });
  }

  static waitForElement(selector: string, condition?: WaitCondition, timeout?: number): Result<MicroAction> {
    return this.create({
      type: 'wait_for_element',
      selector,
      waitCondition: condition || 'visible',
      timeout: timeout || 5000,
      description: `Wait for ${selector} to be ${condition || 'visible'}`
    });
  }

  static extract(selector?: string, elementIndex?: number, description?: string): Result<MicroAction> {
    return this.create({
      type: 'extract',
      selector: selector || '',
      elementIndex: elementIndex || 0,
      description: description || 'Extract data'
    });
  }

  static extractUrl(description?: string): Result<MicroAction> {
    return this.create({
      type: 'extract_url',
      description: description || 'Extract current URL'
    });
  }

  static extractHref(selector: string, elementIndex?: number, description?: string): Result<MicroAction> {
    return this.create({
      type: 'extract_href',
      selector: selector || '',
      elementIndex: elementIndex || 0,
      description: description || `Extract href from ${selector}`
    });
  }

  static pressKey(key: string, description?: string): Result<MicroAction> {
    return this.create({
      type: 'press_key',
      key,
      description: description || `Press ${key} key`
    });
  }

  static clear(selector: string, elementIndex?: number, description?: string): Result<MicroAction> {
    return this.create({
      type: 'clear',
      selector: selector || '',
      elementIndex: elementIndex || 0,
      description: description || `Clear ${selector}`
    });
  }

  static hover(selector: string, elementIndex?: number, description?: string): Result<MicroAction> {
    return this.create({
      type: 'hover',
      selector: selector || '',
      elementIndex: elementIndex || 0,
      description: description || `Hover over ${selector}`
    });
  }

  static selectOption(selector: string, options: string[], elementIndex?: number, description?: string): Result<MicroAction> {
    return this.create({
      type: 'select_option',
      selector: selector || '',
      options,
      elementIndex: elementIndex || 0,
      description: description || `Select option in ${selector}`
    });
  }

  static drag(startIndex: number, endIndex: number, description?: string): Result<MicroAction> {
    return this.create({
      type: 'drag',
      startIndex,
      endIndex,
      description: description || `Drag from element ${startIndex} to ${endIndex}`
    });
  }

  /**
   * Getters for accessing properties
   */
  getType(): MicroActionType {
    return this.type;
  }

  getSelector(): string | undefined {
    return this.selector;
  }

  getElementIndex(): number | undefined {
    return this.elementIndex;
  }

  getValue(): any {
    return this.value;
  }

  getElement(): DOMElement | undefined {
    return this.element;
  }

  getDescription(): string {
    return this.description || this.getDefaultDescription();
  }

  getKey(): string | undefined {
    return this.key;
  }

  getOptions(): string[] | undefined {
    return this.options;
  }

  getWaitCondition(): WaitCondition | undefined {
    return this.waitCondition;
  }

  getTimeout(): number | undefined {
    return this.timeout;
  }

  getStartIndex(): number | undefined {
    return this.startIndex;
  }

  getEndIndex(): number | undefined {
    return this.endIndex;
  }

  /**
   * Business logic methods
   */
  requiresSelector(): boolean {
    const selectorActions: MicroActionType[] = [
      'click', 'fill', 'clear', 'hover', 'select_option', 
      'wait_for_element', 'extract_href'
    ];
    return selectorActions.includes(this.type);
  }

  requiresValue(): boolean {
    return this.type === 'fill';
  }

  requiresElement(): boolean {
    const elementActions: MicroActionType[] = [
      'click', 'fill', 'clear', 'hover', 'select_option', 'extract_href'
    ];
    return elementActions.includes(this.type);
  }

  isExtractionAction(): boolean {
    return this.type === 'extract' || this.type === 'extract_url' || this.type === 'extract_href';
  }

  isWaitAction(): boolean {
    return this.type === 'wait' || this.type === 'wait_for_element';
  }

  isInteractionAction(): boolean {
    const interactionActions: MicroActionType[] = [
      'click', 'fill', 'clear', 'hover', 'select_option', 'press_key', 'drag'
    ];
    return interactionActions.includes(this.type);
  }

  /**
   * Check if this action modifies the page state
   */
  modifiesPageState(): boolean {
    const modifyingActions: MicroActionType[] = [
      'click', 'fill', 'clear', 'select_option', 'press_key', 'drag', 'scroll'
    ];
    return modifyingActions.includes(this.type);
  }

  /**
   * Get expected execution time in milliseconds
   */
  getExpectedDuration(): number {
    switch (this.type) {
      case 'wait':
        return this.timeout || 1000;
      case 'wait_for_element':
        return this.timeout || 5000;
      case 'extract':
      case 'extract_url':
      case 'extract_href':
        return 500;
      case 'drag':
        return 2000;
      case 'scroll':
        return 1000;
      default:
        return 300;
    }
  }

  /**
   * Get a default description based on action type
   */
  private getDefaultDescription(): string {
    switch (this.type) {
      case 'click':
        return `Click on ${this.selector || `element ${this.elementIndex}`}`;
      case 'fill':
        return `Fill ${this.selector || `element ${this.elementIndex}`} with value`;
      case 'scroll':
        return 'Scroll page';
      case 'wait':
        return `Wait for ${this.timeout || 1000}ms`;
      case 'extract':
        return 'Extract data from page';
      case 'extract_url':
        return 'Extract current URL';
      case 'extract_href':
        return `Extract href from ${this.selector || `element ${this.elementIndex}`}`;
      case 'press_key':
        return `Press ${this.key} key`;
      case 'clear':
        return `Clear ${this.selector || `element ${this.elementIndex}`}`;
      case 'hover':
        return `Hover over ${this.selector || `element ${this.elementIndex}`}`;
      case 'select_option':
        return `Select option in ${this.selector || `element ${this.elementIndex}`}`;
      case 'wait_for_element':
        return `Wait for ${this.selector} to be ${this.waitCondition || 'visible'}`;
      case 'drag':
        return `Drag from element ${this.startIndex} to ${this.endIndex}`;
      default:
        return `Perform ${this.type} action`;
    }
  }

  /**
   * Convert to a plain object for serialization
   */
  toObject(): MicroActionData {
    const obj: MicroActionData = { type: this.type };
    
    if (this.selector !== undefined) obj.selector = this.selector;
    if (this.elementIndex !== undefined) obj.elementIndex = this.elementIndex;
    if (this.value !== undefined) obj.value = this.value;
    if (this.element !== undefined) obj.element = this.element;
    if (this.description !== undefined) obj.description = this.description;
    if (this.key !== undefined) obj.key = this.key;
    if (this.options !== undefined) obj.options = this.options;
    if (this.waitCondition !== undefined) obj.waitCondition = this.waitCondition;
    if (this.timeout !== undefined) obj.timeout = this.timeout;
    if (this.startIndex !== undefined) obj.startIndex = this.startIndex;
    if (this.endIndex !== undefined) obj.endIndex = this.endIndex;
    
    return obj;
  }

  /**
   * String representation for debugging
   */
  toString(): string {
    return this.getDescription();
  }

  /**
   * Check equality with another MicroAction
   */
  equals(other: MicroAction): boolean {
    return (
      this.type === other.type &&
      this.selector === other.selector &&
      this.elementIndex === other.elementIndex &&
      this.value === other.value &&
      this.key === other.key &&
      JSON.stringify(this.options) === JSON.stringify(other.options) &&
      this.waitCondition === other.waitCondition &&
      this.timeout === other.timeout &&
      this.startIndex === other.startIndex &&
      this.endIndex === other.endIndex
    );
  }
}