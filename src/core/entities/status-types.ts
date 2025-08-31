export enum WorkflowStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled'
}

export enum TaskStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Retrying = 'retrying'
}

export enum StepStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed'
}

export enum SessionStatus {
  Active = 'active',
  Ended = 'ended',
  Error = 'error'
}

// Result types for entities
export interface TaskResult {
  taskId: string;
  success: boolean;
  data?: any;
  error?: string;
  confidence?: number;
  evidence?: any[];
  duration?: number;
  timestamp: Date;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  taskResults: TaskResult[];
  confidence: number;
}

export interface WorkflowResult {
  workflowId: string;
  success: boolean;
  extractedData?: any;
  summary: string;
  duration: number;
}

// Browser configuration type
export interface BrowserConfig {
  headless: boolean;
  viewport: {
    width: number;
    height: number;
  };
  timeout: number;
}