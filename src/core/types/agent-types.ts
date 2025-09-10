import { MicroActionData, Variable } from '../value-objects';
import { OpenAIModel } from '@/models/chat-openai';
import { Task } from '../entities/task';
import { Plan } from '../entities/plan';


export interface StepResult {
  stepId: string;
  status: 'success' | 'failure' | 'partial';
  success: boolean; // Added for compatibility with workflow-manager
  microActions: MicroActionData[]; // What was actually executed
  evidence: {
    beforeState?: PageState;
    afterState?: PageState;
    extractedData?: any;
  };
  errorReason?: string;
  duration: number;
  attempts: number;
  degraded?: boolean;
}

export interface PageState {
  url: string;
  title: string;
  visibleSections: string[]; // High-level page areas
  availableActions: string[]; // What user can do
  extractedData?: any;
  elements?: DOMElement[]; // Available interactive elements
  screenshot?: string;        // URL to screenshot with highlights
  pristineScreenshot?: string; // URL to clean screenshot
  pixelAbove?: number;        // Pixels of content above viewport
  pixelBelow?: number;        // Pixels of content below viewport
}

export interface DOMElement {
  tagName: string;
  selector: string;
  text?: string;
  attributes?: Record<string, string>;
  index: number; // Index in the elements array
  highlightIndex?: number; // Index for DOM service coordinate lookup
  isVisible: boolean;
  isInteractable: boolean;
  role?: string; // Semantic role like 'button', 'input', etc.
}

export interface ActionResult {
  action: MicroActionData;
  success: boolean;
  error?: string;
  duration?: number;
  timestamp: Date;
  extractedValue?: any; // Value extracted if action type was 'extract'
}

export interface ExecutorConfig {
  llm: any; // LLM interface reference
  model: string;
  browser: any; // Browser interface reference
  domService: any; // DomService interface reference
  variableManager?: any; // VariableManager for variable interpolation
  maxRetries?: number;
  // Deprecated: keeping for backward compatibility
  apiKey?: string;
}

export interface EvaluatorConfig {
  llm: any; // LLM interface reference
  model: string;
  maxRetries?: number;
  // Deprecated: keeping for backward compatibility
  apiKey?: string;
}

export interface WorkflowManagerConfig {
  constraints?: string[];
  timeout?: number;
  maxGlobalRetries?: number;
  variableManager?: any; // VariableManager for variable interpolation
}

// Event types for the workflow system
export interface WorkflowEvent {
  type: string;
  timestamp: Date;
  goal?: string;
  plan?: Plan;
  data?: any;
}

export interface TaskEvent {
  type: string;
  timestamp: Date;
  task: Task;
  result?: StepResult;
  duration?: number;
  data?: any;
}

export interface WorkflowResult {
  id: string;
  goal: string;
  status: 'success' | 'failure' | 'partial' | 'degraded';
  completedTasks: string[];
  completedSteps: Task[];
  failedTasks: string[];

  extractedData?: any;
  summary: string;

  startTime: Date;
  endTime: Date;
  duration: number;
}

// Multi-agent system configuration
export interface MultiAgentConfig {
  headless: boolean;
  variables: Variable[]; 
  models: {
    planner: OpenAIModel;
    executor: OpenAIModel;
    evaluator: OpenAIModel;
    errorHandler: OpenAIModel;
    summarizer: OpenAIModel;
  };
  maxRetries: number;
  timeout: number;
}

// Error handling types
export interface ErrorContext {
  task: Task;
  result: StepResult;
  retries: number;
  timestamp: Date;
}

// Import and re-export agent interfaces that were previously missing
export type { 
  ITaskPlanner, 
  ITaskExecutor, 
  ITaskEvaluator, 
  IErrorHandler,
  PlannerInput,
  PlannerOutput,
  ExecutorInput,
  ExecutorOutput,
  EvaluatorInput,
  EvaluatorOutput,
  ReplanContext 
} from '../interfaces/agent.interface';

export interface RetryStrategy {
  shouldRetry: boolean;
  shouldReplan: boolean;
  delayMs: number;
  modifications?: Partial<Task>;
  reason: string;
}

// Browser automation types (extending existing interfaces)
export interface BrowserState {
  url: string;
  title: string;
  isLoading: boolean;
  hasErrors: boolean;
  viewport: {
    width: number;
    height: number;
  };
}

export interface InteractionContext {
  element: DOMElement;
  pageState: PageState;
  intent: Task;
  previousActions: MicroActionData[];
}