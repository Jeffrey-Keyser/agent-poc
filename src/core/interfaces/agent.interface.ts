// Import types from agent-types.ts
import type { 
  StrategicTask, 
  MicroAction, 
  ActionResult, 
  PageState
} from '../types/agent-types';

export interface IAgent<TInput, TOutput> {
  name: string;
  model: string;
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
  strategy: StrategicTask[];
  id: string;
  goal: string;
  createdAt: Date;
  currentStepIndex: number;
}

export interface ExecutorInput {
  task: StrategicTask;
  pageState: PageState;
  screenshots?: {
    pristine: string;
    highlighted: string;
  };
  memoryLearnings?: string;
  variableManager?: any; // VariableManager instance for variable interpolation
}

export interface ExecutorOutput {
  taskId: string;
  microActions: MicroAction[];
  results: ActionResult[];
  finalState: PageState;
  timestamp: Date;
}

export interface EvaluatorInput {
  step: StrategicTask;
  beforeState: PageState;
  afterState: PageState;
  microActions: MicroAction[];
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
}

export interface ReplanContext {
  originalGoal: string;
  completedSteps: StrategicTask[];
  failedStep: StrategicTask;
  failureReason: string;
  currentState: PageState;
}

export interface ITaskPlanner extends IAgent<PlannerInput, PlannerOutput> {
  replan(context: ReplanContext): Promise<PlannerOutput>;
}

export interface ITaskExecutor extends IAgent<ExecutorInput, ExecutorOutput> {
}

export interface ITaskEvaluator extends IAgent<EvaluatorInput, EvaluatorOutput> {
}

export interface IErrorHandler {
  analyze(context: any): Promise<any>; // ErrorContext and RetryStrategy types from agent-types.ts
}