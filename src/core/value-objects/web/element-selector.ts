import { Result } from './url';

export type SelectorType = 'css' | 'xpath' | 'text' | 'data-testid';

/**
 * Value object representing an element selector for web automation
 */
export class ElementSelector {
  private constructor(
    private readonly value: string,
    private readonly type: SelectorType
  ) {}

  static css(selector: string): Result<ElementSelector> {
    if (!selector || selector.trim().length === 0) {
      return Result.fail('CSS selector cannot be empty');
    }
    
    // Basic validation for CSS selector
    try {
      document.querySelector(selector); // This will throw if invalid
    } catch (error) {
      // In non-browser environments, we'll do basic validation
      if (selector.includes('(') && !selector.includes(')')) {
        return Result.fail('Invalid CSS selector syntax');
      }
    }

    return Result.ok(new ElementSelector(selector, 'css'));
  }

  static xpath(selector: string): Result<ElementSelector> {
    if (!selector || selector.trim().length === 0) {
      return Result.fail('XPath selector cannot be empty');
    }

    // Basic XPath validation
    if (!selector.startsWith('/') && !selector.startsWith('./') && !selector.startsWith('(')) {
      return Result.fail('XPath must start with /, ./ or (');
    }

    return Result.ok(new ElementSelector(selector, 'xpath'));
  }

  static text(text: string): Result<ElementSelector> {
    if (!text || text.trim().length === 0) {
      return Result.fail('Text selector cannot be empty');
    }

    return Result.ok(new ElementSelector(text, 'text'));
  }

  static dataTestId(testId: string): Result<ElementSelector> {
    if (!testId || testId.trim().length === 0) {
      return Result.fail('Data test ID cannot be empty');
    }

    return Result.ok(new ElementSelector(testId, 'data-testid'));
  }

  getValue(): string {
    return this.value;
  }

  getType(): SelectorType {
    return this.type;
  }

  toString(): string {
    switch (this.type) {
      case 'css':
        return this.value;
      case 'xpath':
        return this.value;
      case 'text':
        return `text=${this.value}`;
      case 'data-testid':
        return `[data-testid="${this.value}"]`;
      default:
        return this.value;
    }
  }

  /**
   * Converts this selector to a CSS selector if possible
   */
  toCssSelector(): string {
    switch (this.type) {
      case 'css':
        return this.value;
      case 'data-testid':
        return `[data-testid="${this.value}"]`;
      case 'text':
        return `*:contains("${this.value}")`; // Note: :contains is not standard CSS
      case 'xpath':
        throw new Error('Cannot convert XPath to CSS selector');
      default:
        throw new Error(`Unknown selector type: ${this.type}`);
    }
  }

  equals(other: ElementSelector): boolean {
    return this.value === other.value && this.type === other.type;
  }

  /**
   * Checks if this is a CSS selector
   */
  isCss(): boolean {
    return this.type === 'css';
  }

  /**
   * Checks if this is an XPath selector
   */
  isXPath(): boolean {
    return this.type === 'xpath';
  }

  /**
   * Checks if this is a text selector
   */
  isText(): boolean {
    return this.type === 'text';
  }

  /**
   * Checks if this is a data-testid selector
   */
  isDataTestId(): boolean {
    return this.type === 'data-testid';
  }
}