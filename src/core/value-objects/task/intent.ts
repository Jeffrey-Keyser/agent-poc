import { Result } from '../web/url';

export const VALID_INTENTS = [
  'click',
  'extract',
  'navigate',
  'fill',
  'select',
  'wait',
  'scroll',
  'hover',
  'type',
  'submit',
  'verify',
  'capture'
] as const;

export type IntentType = typeof VALID_INTENTS[number];

/**
 * Value object representing the intent or purpose of a task
 */
export class Intent {
  private constructor(private readonly value: IntentType) {}

  static create(value: string): Result<Intent> {
    const normalizedValue = value.toLowerCase().trim();
    
    if (!VALID_INTENTS.includes(normalizedValue as IntentType)) {
      return Result.fail(`Invalid intent: ${value}. Valid intents are: ${VALID_INTENTS.join(', ')}`);
    }

    return Result.ok(new Intent(normalizedValue as IntentType));
  }

  /**
   * Predefined intent creation methods
   */
  static click(): Intent {
    return new Intent('click');
  }

  static extract(): Intent {
    return new Intent('extract');
  }

  static navigate(): Intent {
    return new Intent('navigate');
  }

  static fill(): Intent {
    return new Intent('fill');
  }

  static select(): Intent {
    return new Intent('select');
  }

  static wait(): Intent {
    return new Intent('wait');
  }

  static scroll(): Intent {
    return new Intent('scroll');
  }

  static hover(): Intent {
    return new Intent('hover');
  }

  static type(): Intent {
    return new Intent('type');
  }

  static submit(): Intent {
    return new Intent('submit');
  }

  static verify(): Intent {
    return new Intent('verify');
  }

  static capture(): Intent {
    return new Intent('capture');
  }

  getValue(): IntentType {
    return this.value;
  }

  toString(): string {
    return this.value;
  }

  equals(other: Intent): boolean {
    return this.value === other.value;
  }

  /**
   * Checks if this intent involves user interaction
   */
  isInteractive(): boolean {
    const interactiveIntents: IntentType[] = ['click', 'fill', 'select', 'type', 'submit', 'hover', 'scroll'];
    return interactiveIntents.includes(this.value);
  }

  /**
   * Checks if this intent involves data extraction
   */
  isExtraction(): boolean {
    const extractionIntents: IntentType[] = ['extract', 'verify', 'capture'];
    return extractionIntents.includes(this.value);
  }

  /**
   * Checks if this intent involves navigation
   */
  isNavigation(): boolean {
    const navigationIntents: IntentType[] = ['navigate', 'scroll'];
    return navigationIntents.includes(this.value);
  }

  /**
   * Checks if this intent involves waiting
   */
  isWaiting(): boolean {
    return this.value === 'wait';
  }

  /**
   * Checks if this intent modifies page state
   */
  isModifying(): boolean {
    const modifyingIntents: IntentType[] = ['click', 'fill', 'select', 'type', 'submit', 'navigate', 'scroll'];
    return modifyingIntents.includes(this.value);
  }

  /**
   * Checks if this intent is read-only
   */
  isReadOnly(): boolean {
    const readOnlyIntents: IntentType[] = ['extract', 'verify', 'capture', 'wait', 'hover'];
    return readOnlyIntents.includes(this.value);
  }

  /**
   * Returns the expected complexity level of this intent
   */
  getComplexityLevel(): 'low' | 'medium' | 'high' {
    switch (this.value) {
      case 'wait':
      case 'hover':
      case 'capture':
        return 'low';
      case 'click':
      case 'fill':
      case 'type':
      case 'scroll':
      case 'navigate':
        return 'medium';
      case 'extract':
      case 'select':
      case 'submit':
      case 'verify':
        return 'high';
      default:
        return 'medium';
    }
  }

  /**
   * Returns typical timeout duration for this intent type
   */
  getTypicalTimeoutSeconds(): number {
    switch (this.value) {
      case 'click':
      case 'hover':
      case 'type':
        return 5;
      case 'fill':
      case 'select':
      case 'submit':
        return 10;
      case 'wait':
        return 30;
      case 'navigate':
        return 30;
      case 'scroll':
        return 3;
      case 'extract':
      case 'verify':
      case 'capture':
        return 15;
      default:
        return 10;
    }
  }

  /**
   * Returns a description of what this intent does
   */
  getDescription(): string {
    switch (this.value) {
      case 'click':
        return 'Click on an element';
      case 'extract':
        return 'Extract data from the page';
      case 'navigate':
        return 'Navigate to a different page or URL';
      case 'fill':
        return 'Fill a form field with data';
      case 'select':
        return 'Select an option from a dropdown or list';
      case 'wait':
        return 'Wait for a condition or element';
      case 'scroll':
        return 'Scroll the page or an element';
      case 'hover':
        return 'Hover over an element';
      case 'type':
        return 'Type text into an input field';
      case 'submit':
        return 'Submit a form';
      case 'verify':
        return 'Verify that a condition is met';
      case 'capture':
        return 'Capture a screenshot or page state';
      default:
        return `Perform ${this.value} action`;
    }
  }
}