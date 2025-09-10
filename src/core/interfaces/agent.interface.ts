// Import types from agent-types.ts
import type { 
  ActionResult, 
  PageState,
  StepResult
} from '../types/agent-types';
import { MicroActionData } from '../value-objects/task';
import { Task } from '../entities/task';

export interface IAgent<TInput, TOutput> {
  name: string;
  maxRetries: number;
  
  execute(input: TInput): Promise<TOutput>;
  validateInput(input: TInput): boolean;
  validateOutput(output: TOutput): boolean;
}

// Specific input/output types will be defined in agent-types.ts
export interface PlannerInput {
  goal: string;
  currentUrl: string;
  constraints: string[];
  currentState?: PageState;
}

export interface PlannerOutput {
  strategy: Task[];
  id: string;
  goal: string;
  createdAt: Date;
  currentStepIndex: number;
}

export interface ExecutorInput {
  expectedOutcome: string;
  memoryLearnings?: string;
}

export interface ExecutorOutput {
  taskId: string;
  microActions: MicroActionData[];
  finalState: PageState;
  timestamp: Date;
}

export interface EvaluatorInput {
  step: Task;
  beforeState: PageState;
  afterState: PageState;
  microActions: MicroActionData[];
  results: ActionResult[];
  screenshots?: {
    before: string;
    after: string;
  };
}

export interface EvaluatorOutput {
  stepId: string;
  success: boolean;
  confidence: number;
  evidence: string;
  reason: string;
  suggestions: string[];
  partialSuccess?: boolean;
  achievedAlternative?: string;
}

export interface ReplanContext {
  originalGoal: string;
  completedSteps: Task[];
  failedStep: Task;
  failureReason: string;
  currentState: PageState;
  accumulatedData?: Record<string, any>;
  failedApproaches?: string[];
  attemptNumber?: number;
  memoryLearnings?: string; // Memory learnings to avoid repeated mistakes
}

export interface ITaskPlanner extends IAgent<PlannerInput, PlannerOutput> {
  replan(context: ReplanContext): Promise<PlannerOutput>;
}

export interface ITaskExecutor extends IAgent<ExecutorInput, ExecutorOutput> {
}

export interface ITaskEvaluator extends IAgent<EvaluatorInput, EvaluatorOutput> {
}

export interface ITaskSummarizer extends IAgent<SummarizerInput, SummarizerOutput> {
}

export interface IErrorHandler {
  analyze(context: any): Promise<any>; // ErrorContext and RetryStrategy types from agent-types.ts
}

export interface SummarizerInput {
  goal: string;                           // Original workflow goal
  plan: any[];                            // The planned strategy (compatible structure)
  completedSteps: StepResult[];           // Array of step results (from Map values)
  extractedData: Record<string, any>;     // Raw extracted data collected during workflow
  totalDuration: number;                  // Total time in milliseconds
  startTime: Date;                        // When workflow started
  endTime: Date;                          // When workflow ended
  errors?: string[];                      // Errors collected from failed steps
  url?: string;                           // Final URL from browser
}

export interface SummarizerOutput {
  workflowId: string;                     // Unique workflow identifier
  objective: string;                      // Human-readable objective
  status: 'completed' | 'partial' | 'failed';
  summary: string;                        // Executive summary (2-3 sentences)
  
  extractedFields: {
    label: string;                        // Human-readable label
    value: any;                           // The actual value
  }[];
  
  performanceMetrics: {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    duration: string;
  };
  
  timestamp: Date;
  rawDataAvailable: boolean;
}
