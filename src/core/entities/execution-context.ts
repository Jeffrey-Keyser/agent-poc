import { 
  SessionId,
  WorkflowId,
  TaskId,
  Url,
  PageState,
  Viewport
} from '../value-objects';
import { Result } from './result';
import { TaskResult } from './status-types';

// Context information needed for task execution
export interface ExecutionEnvironment {
  currentUrl: Url;
  pageState: PageState | undefined;
  viewport: Viewport;
  userAgent: string;
  cookies: string[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

// Execution Context Entity - manages the current state and context of task execution
export class ExecutionContext {
  private readonly id: SessionId;
  private readonly workflowId: WorkflowId;
  private currentTaskId: TaskId | undefined;
  private environment: ExecutionEnvironment;
  private readonly createdAt: Date;
  private updatedAt: Date;
  private lastExecutionResult: TaskResult | undefined;
  private executionCount: number = 0;
  private readonly executionHistory: TaskResult[] = [];

  constructor(
    id: SessionId,
    workflowId: WorkflowId,
    initialUrl: Url,
    viewport: Viewport,
    userAgent: string = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  ) {
    this.id = id;
    this.workflowId = workflowId;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    
    // Initialize execution environment
    this.environment = {
      currentUrl: initialUrl,
      pageState: undefined,
      viewport,
      userAgent,
      cookies: [],
      localStorage: {},
      sessionStorage: {}
    };
  }

  // Static factory method
  static create(
    id: SessionId,
    workflowId: WorkflowId,
    initialUrl: Url,
    viewport: Viewport,
    userAgent?: string
  ): Result<ExecutionContext> {
    // Validate inputs
    if (viewport.width <= 0 || viewport.height <= 0) {
      return Result.fail('Viewport dimensions must be positive');
    }

    return Result.ok(new ExecutionContext(
      id,
      workflowId,
      initialUrl,
      viewport,
      userAgent
    ));
  }

  // Getters
  getId(): SessionId {
    return this.id;
  }

  getWorkflowId(): WorkflowId {
    return this.workflowId;
  }

  getCurrentTaskId(): TaskId | undefined {
    return this.currentTaskId;
  }

  getEnvironment(): ExecutionEnvironment {
    // Return a deep copy to maintain immutability
    return {
      currentUrl: this.environment.currentUrl,
      pageState: this.environment.pageState,
      viewport: this.environment.viewport,
      userAgent: this.environment.userAgent,
      cookies: [...this.environment.cookies],
      localStorage: { ...this.environment.localStorage },
      sessionStorage: { ...this.environment.sessionStorage }
    };
  }

  getCurrentUrl(): Url {
    return this.environment.currentUrl;
  }

  getPageState(): PageState | undefined {
    return this.environment.pageState;
  }

  getViewport(): Viewport {
    return this.environment.viewport;
  }

  getLastExecutionResult(): TaskResult | undefined {
    return this.lastExecutionResult;
  }

  getExecutionCount(): number {
    return this.executionCount;
  }

  getExecutionHistory(): ReadonlyArray<TaskResult> {
    return this.executionHistory;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  // Context update methods
  updateCurrentUrl(url: Url): Result<void> {
    this.environment.currentUrl = url;
    this.updatedAt = new Date();
    return Result.ok();
  }

  updatePageState(pageState: PageState): Result<void> {
    this.environment.pageState = pageState;
    this.updatedAt = new Date();
    return Result.ok();
  }

  updateViewport(viewport: Viewport): Result<void> {
    if (viewport.width <= 0 || viewport.height <= 0) {
      return Result.fail('Viewport dimensions must be positive');
    }
    
    this.environment.viewport = viewport;
    this.updatedAt = new Date();
    return Result.ok();
  }

  updateCookies(cookies: string[]): void {
    this.environment.cookies = [...cookies];
    this.updatedAt = new Date();
  }

  updateLocalStorage(localStorage: Record<string, string>): void {
    this.environment.localStorage = { ...localStorage };
    this.updatedAt = new Date();
  }

  updateSessionStorage(sessionStorage: Record<string, string>): void {
    this.environment.sessionStorage = { ...sessionStorage };
    this.updatedAt = new Date();
  }

  // Task execution context management
  startTaskExecution(taskId: TaskId): Result<void> {
    if (this.currentTaskId) {
      return Result.fail('Another task is already being executed');
    }

    this.currentTaskId = taskId;
    this.updatedAt = new Date();
    return Result.ok();
  }

  completeTaskExecution(result: TaskResult): Result<void> {
    if (!this.currentTaskId) {
      return Result.fail('No task is currently being executed');
    }

    if (this.currentTaskId.toString() !== result.taskId) {
      return Result.fail('Task result does not match current task');
    }

    this.lastExecutionResult = result;
    this.executionHistory.push(result);
    this.executionCount++;
    this.currentTaskId = undefined;
    this.updatedAt = new Date();

    return Result.ok();
  }

  // Context analysis methods
  isTaskRunning(): boolean {
    return this.currentTaskId !== undefined;
  }

  getSuccessfulExecutions(): number {
    return this.executionHistory.filter(result => result.success).length;
  }

  getFailedExecutions(): number {
    return this.executionHistory.filter(result => !result.success).length;
  }

  getSuccessRate(): number {
    if (this.executionCount === 0) return 0;
    return this.getSuccessfulExecutions() / this.executionCount;
  }

  getAverageExecutionDuration(): number {
    if (this.executionHistory.length === 0) return 0;
    
    const totalDuration = this.executionHistory.reduce(
      (sum, result) => sum + (result.duration || 0),
      0
    );
    
    return totalDuration / this.executionHistory.length;
  }

  getRecentExecutions(count: number = 5): ReadonlyArray<TaskResult> {
    return this.executionHistory.slice(-count);
  }

  getExecutionsByTimeRange(startTime: Date, endTime: Date): ReadonlyArray<TaskResult> {
    return this.executionHistory.filter(result => 
      result.timestamp >= startTime && result.timestamp <= endTime
    );
  }

  // Context state validation
  isReady(): boolean {
    return !this.isTaskRunning() && 
           this.environment.currentUrl !== undefined &&
           this.environment.viewport.width > 0 &&
           this.environment.viewport.height > 0;
  }

  hasPageState(): boolean {
    return this.environment.pageState !== undefined;
  }

  isUrlAccessible(): boolean {
    // Basic URL validation - in reality would check if URL is reachable
    try {
      const url = this.environment.currentUrl.toString();
      return url.startsWith('http://') || url.startsWith('https://');
    } catch {
      return false;
    }
  }

  // Context persistence helpers
  getSnapshot(): {
    id: string;
    workflowId: string;
    currentTaskId: string | undefined;
    environment: ExecutionEnvironment;
    executionCount: number;
    lastExecutionResult: TaskResult | undefined;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      id: this.id.toString(),
      workflowId: this.workflowId.toString(),
      currentTaskId: this.currentTaskId?.toString(),
      environment: this.getEnvironment(),
      executionCount: this.executionCount,
      lastExecutionResult: this.lastExecutionResult,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Domain invariants validation
  validateInvariants(): void {
    if (this.executionCount < 0) {
      throw new Error('Execution count cannot be negative');
    }

    if (this.executionHistory.length !== this.executionCount) {
      throw new Error('Execution history length must match execution count');
    }

    if (this.updatedAt < this.createdAt) {
      throw new Error('Updated time cannot be before created time');
    }

    if (this.environment.viewport.width <= 0 || this.environment.viewport.height <= 0) {
      throw new Error('Viewport dimensions must be positive');
    }

    // Validate URL is accessible
    if (!this.isUrlAccessible()) {
      throw new Error('Current URL must be accessible');
    }
  }
}