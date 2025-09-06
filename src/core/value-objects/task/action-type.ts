import { Result } from '../web/url';
import { Intent } from './intent';

export const ACTION_TYPES = [
  // Click actions
  'left-click',
  'right-click',
  'double-click',
  
  // Navigation actions
  'navigate-url',
  'navigate-back',
  'navigate-forward',
  'refresh-page',
  
  // Input actions
  'type-text',
  'clear-input',
  'upload-file',
  
  // Form actions
  'select-option',
  'check-checkbox',
  'uncheck-checkbox',
  'select-radio',
  'submit-form',
  
  // Scroll actions
  'scroll-up',
  'scroll-down',
  'scroll-left',
  'scroll-right',
  'scroll-to-element',
  'scroll-to-top',
  'scroll-to-bottom',
  
  // Wait actions
  'wait-for-element',
  'wait-for-text',
  'wait-for-url',
  'wait-for-timeout',
  
  // Extraction actions
  'extract-text',
  'extract-attribute',
  'extract-html',
  'extract-url',
  'extract-table-data',
  'extract-form-data',
  
  // Verification actions
  'verify-text-present',
  'verify-text-absent',
  'verify-element-visible',
  'verify-element-hidden',
  'verify-url-matches',
  'verify-title-matches',
  
  // Capture actions
  'capture-screenshot',
  'capture-element-screenshot',
  'capture-page-state',
  
  // Mouse actions
  'hover-element',
  'drag-and-drop'
] as const;

export type ActionTypeValue = typeof ACTION_TYPES[number];

/**
 * Value object representing specific action types for tasks
 */
export class ActionType {
  private constructor(private readonly value: ActionTypeValue) {}

  static create(value: string): Result<ActionType> {
    const normalizedValue = value.toLowerCase().trim().replace(/[_\s]/g, '-');
    
    if (!ACTION_TYPES.includes(normalizedValue as ActionTypeValue)) {
      return Result.fail(`Invalid action type: ${value}. Valid action types include: ${ACTION_TYPES.slice(0, 10).join(', ')}...`);
    }

    return Result.ok(new ActionType(normalizedValue as ActionTypeValue));
  }

  /**
   * Create ActionType from Intent
   */
  static fromIntent(intent: Intent): ActionType[] {
    switch (intent.getValue()) {
      case 'click':
        return [
          new ActionType('left-click'),
          new ActionType('right-click'),
          new ActionType('double-click')
        ];
      case 'navigate':
        return [
          new ActionType('navigate-url'),
          new ActionType('navigate-back'),
          new ActionType('navigate-forward'),
          new ActionType('refresh-page')
        ];
      case 'fill':
        return [
          new ActionType('type-text'),
          new ActionType('clear-input')
        ];
      case 'type':
        return [new ActionType('type-text')];
      case 'select':
        return [
          new ActionType('select-option'),
          new ActionType('check-checkbox'),
          new ActionType('uncheck-checkbox'),
          new ActionType('select-radio')
        ];
      case 'submit':
        return [new ActionType('submit-form')];
      case 'scroll':
        return [
          new ActionType('scroll-up'),
          new ActionType('scroll-down'),
          new ActionType('scroll-to-element')
        ];
      case 'wait':
        return [
          new ActionType('wait-for-element'),
          new ActionType('wait-for-text'),
          new ActionType('wait-for-timeout')
        ];
      case 'extract':
        return [
          new ActionType('extract-text'),
          new ActionType('extract-attribute'),
          new ActionType('extract-html')
        ];
      case 'verify':
        return [
          new ActionType('verify-text-present'),
          new ActionType('verify-element-visible')
        ];
      case 'capture':
        return [
          new ActionType('capture-screenshot'),
          new ActionType('capture-page-state')
        ];
      case 'hover':
        return [new ActionType('hover-element')];
      default:
        return [];
    }
  }

  /**
   * Common action type creation methods
   */
  static leftClick(): ActionType {
    return new ActionType('left-click');
  }

  static typeText(): ActionType {
    return new ActionType('type-text');
  }

  static navigateUrl(): ActionType {
    return new ActionType('navigate-url');
  }

  static extractText(): ActionType {
    return new ActionType('extract-text');
  }

  static waitForElement(): ActionType {
    return new ActionType('wait-for-element');
  }

  static captureScreenshot(): ActionType {
    return new ActionType('capture-screenshot');
  }

  static scroll(): ActionType {
    return new ActionType('scroll-down');
  }

  getValue(): ActionTypeValue {
    return this.value;
  }

  toString(): string {
    return this.value;
  }

  equals(other: ActionType): boolean {
    return this.value === other.value;
  }

  /**
   * Returns the corresponding intent for this action type
   */
  getIntent(): Intent {
    if (this.value.startsWith('left-click') || this.value.startsWith('right-click') || this.value.startsWith('double-click')) {
      return Intent.click();
    } else if (this.value.startsWith('navigate-')) {
      return Intent.navigate();
    } else if (this.value.startsWith('type-') || this.value.startsWith('clear-')) {
      return Intent.fill();
    } else if (this.value.startsWith('select-') || this.value.startsWith('check-') || this.value.startsWith('uncheck-')) {
      return Intent.select();
    } else if (this.value.startsWith('submit-')) {
      return Intent.submit();
    } else if (this.value.startsWith('scroll-')) {
      return Intent.scroll();
    } else if (this.value.startsWith('wait-')) {
      return Intent.wait();
    } else if (this.value.startsWith('extract-')) {
      return Intent.extract();
    } else if (this.value.startsWith('verify-')) {
      return Intent.verify();
    } else if (this.value.startsWith('capture-')) {
      return Intent.capture();
    } else if (this.value.startsWith('hover-')) {
      return Intent.hover();
    } else {
      // Default fallback
      return Intent.click();
    }
  }

  /**
   * Checks if this action requires a target element
   */
  requiresElement(): boolean {
    const elementRequiredActions: ActionTypeValue[] = [
      'left-click', 'right-click', 'double-click',
      'type-text', 'clear-input',
      'select-option', 'check-checkbox', 'uncheck-checkbox', 'select-radio',
      'scroll-to-element',
      'wait-for-element',
      'extract-text', 'extract-attribute', 'extract-html',
      'verify-element-visible', 'verify-element-hidden',
      'capture-element-screenshot',
      'hover-element'
    ];

    return elementRequiredActions.includes(this.value);
  }

  /**
   * Checks if this action modifies page state
   */
  isModifying(): boolean {
    const modifyingActions: ActionTypeValue[] = [
      'left-click', 'right-click', 'double-click',
      'navigate-url', 'navigate-back', 'navigate-forward', 'refresh-page',
      'type-text', 'clear-input', 'upload-file',
      'select-option', 'check-checkbox', 'uncheck-checkbox', 'select-radio', 'submit-form',
      'scroll-up', 'scroll-down', 'scroll-left', 'scroll-right', 'scroll-to-element',
      'scroll-to-top', 'scroll-to-bottom'
    ];

    return modifyingActions.includes(this.value);
  }

  /**
   * Gets the expected execution time in seconds
   */
  getExpectedExecutionTime(): number {
    if (this.value.startsWith('wait-')) {
      return 10; // Wait actions can be longer
    } else if (this.value.startsWith('navigate-')) {
      return 5; // Navigation can take time
    } else if (this.value.startsWith('extract-') || this.value.startsWith('capture-')) {
      return 3; // Extraction and capture actions
    } else {
      return 2; // Most actions are quick
    }
  }

  /**
   * Gets the complexity level of this action
   */
  getComplexityLevel(): 'low' | 'medium' | 'high' {
    const highComplexityActions: ActionTypeValue[] = [
      'extract-table-data', 'extract-form-data', 'drag-and-drop',
      'submit-form', 'upload-file'
    ];

    const lowComplexityActions: ActionTypeValue[] = [
      'left-click', 'hover-element', 'scroll-up', 'scroll-down',
      'wait-for-timeout', 'capture-screenshot'
    ];

    if (highComplexityActions.includes(this.value)) {
      return 'high';
    } else if (lowComplexityActions.includes(this.value)) {
      return 'low';
    } else {
      return 'medium';
    }
  }

  /**
   * Gets a human-readable description of this action
   */
  getDescription(): string {
    const descriptions: Record<ActionTypeValue, string> = {
      'left-click': 'Perform a left mouse click',
      'right-click': 'Perform a right mouse click',
      'double-click': 'Perform a double mouse click',
      'navigate-url': 'Navigate to a specific URL',
      'navigate-back': 'Navigate to the previous page',
      'navigate-forward': 'Navigate to the next page',
      'refresh-page': 'Refresh the current page',
      'type-text': 'Type text into an input field',
      'clear-input': 'Clear the content of an input field',
      'upload-file': 'Upload a file through a file input',
      'select-option': 'Select an option from a dropdown',
      'check-checkbox': 'Check a checkbox',
      'uncheck-checkbox': 'Uncheck a checkbox',
      'select-radio': 'Select a radio button',
      'submit-form': 'Submit a form',
      'scroll-up': 'Scroll up on the page',
      'scroll-down': 'Scroll down on the page',
      'scroll-left': 'Scroll left on the page',
      'scroll-right': 'Scroll right on the page',
      'scroll-to-element': 'Scroll to a specific element',
      'scroll-to-top': 'Scroll to the top of the page',
      'scroll-to-bottom': 'Scroll to the bottom of the page',
      'wait-for-element': 'Wait for an element to appear',
      'wait-for-text': 'Wait for specific text to appear',
      'wait-for-url': 'Wait for URL to change',
      'wait-for-timeout': 'Wait for a specified duration',
      'extract-text': 'Extract text content from an element',
      'extract-attribute': 'Extract an attribute value from an element',
      'extract-html': 'Extract HTML content from an element',
      'extract-url': 'Extract the current page URL',
      'extract-table-data': 'Extract data from a table',
      'extract-form-data': 'Extract data from a form',
      'verify-text-present': 'Verify that specific text is present',
      'verify-text-absent': 'Verify that specific text is not present',
      'verify-element-visible': 'Verify that an element is visible',
      'verify-element-hidden': 'Verify that an element is hidden',
      'verify-url-matches': 'Verify that the URL matches a pattern',
      'verify-title-matches': 'Verify that the page title matches a pattern',
      'capture-screenshot': 'Capture a screenshot of the page',
      'capture-element-screenshot': 'Capture a screenshot of a specific element',
      'capture-page-state': 'Capture the current state of the page',
      'hover-element': 'Hover over an element',
      'drag-and-drop': 'Perform drag and drop operation'
    };

    return descriptions[this.value] || `Perform ${this.value} action`;
  }
}