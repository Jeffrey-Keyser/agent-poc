import { Task, Result, TaskResult } from '../entities';
import { TaskId, ActionType, Evidence, Url, Viewport, PageState, Duration, Timeout } from '../value-objects';
import { TaskQueue } from '../services/task-queue';

// Execution context for task execution
export interface TaskExecutionContext {
  currentUrl: Url;
  viewport: Viewport;
  pageState: PageState;
  availableActions: string[];
  previousActions: ExecutionAction[];
  timeRemaining?: Duration;
}

// Execution action record
export interface ExecutionAction {
  taskId: TaskId;
  action: ActionType;
  timestamp: Date;
  coordinates?: { x: number; y: number };
  input?: string;
  success: boolean;
  evidence?: Evidence;
}

// Enhanced execution result with detailed metrics
export interface EnhancedTaskResult extends TaskResult {
  executionTime: Duration;
  retryCount: number;
  evidence: Evidence[];
  actionsTaken: ExecutionAction[];
  confidenceScore: number;
  errorDetails: ExecutionError | undefined;
}

export interface ExecutionError {
  type: 'timeout' | 'element-not-found' | 'navigation-error' | 'validation-error' | 'unknown';
  message: string;
  recoverable: boolean;
  suggestedAction: string;
  stackTrace: string | undefined;
}

// Step execution configuration
export interface StepExecutionConfig {
  timeout: Timeout;
  retryPolicy: {
    maxRetries: number;
    retryDelay: Duration;
    retryOnErrors: string[];
  };
  validationEnabled: boolean;
  evidenceCollection: boolean;
}

/**
 * Domain service interface for execution operations.
 * Handles the complex domain logic of executing tasks and steps in web automation.
 */
export interface ExecutionService {
  /**
   * Executes a single task with the given context
   */
  executeTask(
    task: Task,
    config?: Partial<StepExecutionConfig>,
    queue?: TaskQueue
  ): Promise<Result<EnhancedTaskResult>>;
}
