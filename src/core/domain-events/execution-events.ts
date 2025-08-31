import { DomainEvent } from './base-events';
import { SessionId } from '../value-objects/identifiers/session-id';
import { WorkflowId } from '../value-objects/identifiers/workflow-id';
import { TaskId } from '../value-objects/identifiers/task-id';

/**
 * Event fired when a browser session is started
 */
export class SessionStartedEvent extends DomainEvent {
  constructor(
    public readonly sessionId: SessionId,
    public readonly workflowId: WorkflowId,
    public readonly browserConfig: BrowserConfig,
    public readonly userAgent?: string,
    public readonly viewport?: { width: number; height: number },
    occurredAt?: Date
  ) {
    super(sessionId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      sessionId: this.sessionId.toString(),
      workflowId: this.workflowId.toString(),
      browserConfig: this.browserConfig,
      userAgent: this.userAgent,
      viewport: this.viewport
    };
  }

  static fromJSON(data: Record<string, any>): SessionStartedEvent {
    return new SessionStartedEvent(
      new (SessionId as any)(data.sessionId),
      new (WorkflowId as any)(data.workflowId),
      data.browserConfig,
      data.userAgent,
      data.viewport,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when a browser session ends
 */
export class SessionEndedEvent extends DomainEvent {
  constructor(
    public readonly sessionId: SessionId,
    public readonly workflowId: WorkflowId,
    public readonly duration: number,
    public readonly reason: string,
    public readonly tasksExecuted: number,
    public readonly successRate: number,
    public readonly finalUrl?: string,
    occurredAt?: Date
  ) {
    super(sessionId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      sessionId: this.sessionId.toString(),
      workflowId: this.workflowId.toString(),
      duration: this.duration,
      reason: this.reason,
      tasksExecuted: this.tasksExecuted,
      successRate: this.successRate,
      finalUrl: this.finalUrl
    };
  }

  static fromJSON(data: Record<string, any>): SessionEndedEvent {
    return new SessionEndedEvent(
      new (SessionId as any)(data.sessionId),
      new (WorkflowId as any)(data.workflowId),
      data.duration,
      data.reason,
      data.tasksExecuted,
      data.successRate,
      data.finalUrl,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when page navigation occurs
 */
export class PageNavigationEvent extends DomainEvent {
  constructor(
    public readonly sessionId: SessionId,
    public readonly workflowId: WorkflowId,
    public readonly taskId: TaskId,
    public readonly fromUrl: string,
    public readonly toUrl: string,
    public readonly navigationType: NavigationType,
    public readonly duration: number,
    public readonly success: boolean,
    public readonly error?: string,
    occurredAt?: Date
  ) {
    super(sessionId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      sessionId: this.sessionId.toString(),
      workflowId: this.workflowId.toString(),
      taskId: this.taskId.toString(),
      fromUrl: this.fromUrl,
      toUrl: this.toUrl,
      navigationType: this.navigationType,
      duration: this.duration,
      success: this.success,
      error: this.error
    };
  }

  static fromJSON(data: Record<string, any>): PageNavigationEvent {
    return new PageNavigationEvent(
      new (SessionId as any)(data.sessionId),
      new (WorkflowId as any)(data.workflowId),
      new (TaskId as any)(data.taskId),
      data.fromUrl,
      data.toUrl,
      data.navigationType,
      data.duration,
      data.success,
      data.error,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when an element interaction occurs
 */
export class ElementInteractionEvent extends DomainEvent {
  constructor(
    public readonly sessionId: SessionId,
    public readonly workflowId: WorkflowId,
    public readonly taskId: TaskId,
    public readonly interactionType: InteractionType,
    public readonly elementSelector: string,
    public readonly success: boolean,
    public readonly confidence: number,
    public readonly elementText: string | undefined = undefined,
    public readonly inputValue: string | undefined = undefined,
    public readonly screenshot: string | undefined = undefined,
    public readonly error: string | undefined = undefined,
    occurredAt?: Date
  ) {
    super(sessionId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      sessionId: this.sessionId.toString(),
      workflowId: this.workflowId.toString(),
      taskId: this.taskId.toString(),
      interactionType: this.interactionType,
      elementSelector: this.elementSelector,
      elementText: this.elementText,
      inputValue: this.inputValue,
      success: this.success,
      confidence: this.confidence,
      screenshot: this.screenshot,
      error: this.error
    };
  }

  static fromJSON(data: Record<string, any>): ElementInteractionEvent {
    return new ElementInteractionEvent(
      new (SessionId as any)(data.sessionId),
      new (WorkflowId as any)(data.workflowId),
      new (TaskId as any)(data.taskId),
      data.interactionType,
      data.elementSelector,
      data.elementText,
      data.inputValue,
      data.success,
      data.confidence,
      data.screenshot,
      data.error,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when data is extracted from a page
 */
export class DataExtractionEvent extends DomainEvent {
  constructor(
    public readonly sessionId: SessionId,
    public readonly workflowId: WorkflowId,
    public readonly taskId: TaskId,
    public readonly extractionType: string,
    public readonly selector: string | undefined = undefined,
    public readonly extractedData: any = null,
    public readonly dataSchema: string | undefined = undefined,
    public readonly confidence: number = 0,
    public readonly pageUrl: string = '',
    public readonly screenshot: string | undefined = undefined,
    occurredAt?: Date
  ) {
    super(sessionId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      sessionId: this.sessionId.toString(),
      workflowId: this.workflowId.toString(),
      taskId: this.taskId.toString(),
      extractionType: this.extractionType,
      selector: this.selector,
      extractedData: this.extractedData,
      dataSchema: this.dataSchema,
      confidence: this.confidence,
      pageUrl: this.pageUrl,
      screenshot: this.screenshot
    };
  }

  static fromJSON(data: Record<string, any>): DataExtractionEvent {
    return new DataExtractionEvent(
      new (SessionId as any)(data.sessionId),
      new (WorkflowId as any)(data.workflowId),
      new (TaskId as any)(data.taskId),
      data.extractionType,
      data.selector,
      data.extractedData,
      data.dataSchema,
      data.confidence,
      data.pageUrl,
      data.screenshot,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Event fired when an error occurs during execution
 */
export class ExecutionErrorEvent extends DomainEvent {
  constructor(
    public readonly sessionId: SessionId,
    public readonly workflowId: WorkflowId,
    public readonly taskId: TaskId,
    public readonly error: Error,
    public readonly errorType: ErrorType,
    public readonly context: Record<string, any>,
    public readonly recoverable: boolean,
    public readonly screenshot?: string,
    public readonly pageUrl?: string,
    occurredAt?: Date
  ) {
    super(sessionId.toString(), occurredAt);
  }

  toJSON(): Record<string, any> {
    return {
      ...this.getMetadata(),
      sessionId: this.sessionId.toString(),
      workflowId: this.workflowId.toString(),
      taskId: this.taskId.toString(),
      error: {
        message: this.error.message,
        stack: this.error.stack,
        name: this.error.name
      },
      errorType: this.errorType,
      context: this.context,
      recoverable: this.recoverable,
      screenshot: this.screenshot,
      pageUrl: this.pageUrl
    };
  }

  static fromJSON(data: Record<string, any>): ExecutionErrorEvent {
    const error = new Error(data.error.message);
    error.name = data.error.name;
    error.stack = data.error.stack;

    return new ExecutionErrorEvent(
      new (SessionId as any)(data.sessionId),
      new (WorkflowId as any)(data.workflowId),
      new (TaskId as any)(data.taskId),
      error,
      data.errorType,
      data.context,
      data.recoverable,
      data.screenshot,
      data.pageUrl,
      new Date(data.occurredAt)
    );
  }
}

/**
 * Supporting interfaces and enums
 */
export interface BrowserConfig {
  headless: boolean;
  viewport: { width: number; height: number };
  userAgent?: string;
  timeout: number;
  waitForSelector?: string;
}

export enum NavigationType {
  CLICK = 'click',
  FORM_SUBMIT = 'form_submit',
  DIRECT = 'direct',
  BACK = 'back',
  FORWARD = 'forward',
  RELOAD = 'reload'
}

export enum InteractionType {
  CLICK = 'click',
  TYPE = 'type',
  SELECT = 'select',
  HOVER = 'hover',
  DRAG = 'drag',
  SCROLL = 'scroll',
  FOCUS = 'focus',
  BLUR = 'blur'
}

export enum ErrorType {
  ELEMENT_NOT_FOUND = 'element_not_found',
  TIMEOUT = 'timeout',
  NAVIGATION_ERROR = 'navigation_error',
  SELECTOR_ERROR = 'selector_error',
  JAVASCRIPT_ERROR = 'javascript_error',
  NETWORK_ERROR = 'network_error',
  BROWSER_ERROR = 'browser_error',
  UNKNOWN_ERROR = 'unknown_error'
}