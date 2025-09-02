// Strategic level - what the Planner creates
export interface StrategicTask {
  id: string;
  name: string;
  description: string;
  intent: 'search' | 'filter' | 'navigate' | 'extract' | 'authenticate' | 'verify' | 'interact';
  targetConcept: string; // e.g., "search box", "price filter", "results list" - NOT selectors
  inputData?: any; // High-level data, e.g., "wireless headphones", "$100"
  expectedOutcome: string; // User-observable outcome, not technical details
  dependencies: string[];
  maxAttempts: number;
  priority: number;
  acceptableOutcomes?: string[];     // Alternative acceptable outcomes
  requiredEvidence?: string[];       // Must-have evidence for success
  optionalEvidence?: string[];       // Nice-to-have evidence
  minSuccessConfidence?: number;     // Minimum confidence for success (default 0.7)
  allowPartialSuccess?: boolean;     // Can this step succeed partially?
}

// Tactical level - what the Executor creates at runtime
export interface MicroAction {
  type: 'click' | 'fill' | 'scroll' | 'wait' | 'extract' | 'press_key' | 
        'clear' | 'hover' | 'select_option' | 'wait_for_element' | 'drag' |
        'extract_url' | 'extract_href';
  selector?: string; // Determined at execution time from DOM
  elementIndex?: number; // Index from getInteractiveElements()
  value?: any;
  element?: DOMElement; // Actual element from current page state
  description?: string; // For debugging and logging
  key?: string; // For press_key actions
  options?: string[]; // For select_option action
  waitCondition?: 'visible' | 'hidden' | 'attached' | 'detached'; // For wait_for_element
  timeout?: number; // For wait_for_element (in milliseconds)
  startIndex?: number; // For drag action - starting element index
  endIndex?: number; // For drag action - ending element index
}

export interface StrategicPlan {
  id: string;
  goal: string;
  steps: StrategicTask[]; // 3-7 high-level steps
  createdAt: Date;
  currentStepIndex: number;
}

export interface StepResult {
  stepId: string;
  status: 'success' | 'failure' | 'partial';
  success: boolean; // Added for compatibility with workflow-manager
  microActions: MicroAction[]; // What was actually executed
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
  action: MicroAction;
  success: boolean;
  error?: string;
  duration?: number;
  timestamp: Date;
  extractedValue?: any; // Value extracted if action type was 'extract'
}

// Configuration types
export interface PlannerConfig {
  llm: any; // LLM interface reference
  model: string;
  maxRetries?: number;
  // Deprecated: keeping for backward compatibility
  apiKey?: string;
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
  plan?: StrategicPlan;
  data?: any;
}

export interface TaskEvent {
  type: string;
  timestamp: Date;
  task: StrategicTask;
  result?: StepResult;
  duration?: number;
  data?: any;
}

// Result types
export interface WorkflowResult {
  id: string;
  goal: string;
  status: 'success' | 'failure' | 'partial' | 'degraded';
  completedTasks: string[];
  completedSteps: StrategicTask[]; // Added for compatibility with workflow-manager
  failedTasks: string[];
  totalDuration: number;
  duration: number; // Added for compatibility with workflow-monitor
  startTime: Date;
  endTime: Date;
  extractedData?: any;
  finalState?: PageState;
  summary: string;
  errors?: string[]; // Added for compatibility with migration-service
  structuredSummary?: any;  // SummarizerOutput from agent.interface
  cleanData?: any;           // Cleaned extracted fields
  completionPercentage: number;
  partialResults?: any;
  degradedSteps?: string[];
  bestEffortData?: any;
  confidenceScore: number;
}

// Multi-agent system configuration
export interface MultiAgentConfig {
  apiKey: string;
  headless?: boolean;
  variables?: any[]; // Variable type from existing system
  models?: {
    planner?: string;
    executor?: string;
    evaluator?: string;
    errorHandler?: string;
    summarizer?: string;
  };
  maxRetries?: number;
  timeout?: number;
}

// Error handling types
export interface ErrorContext {
  task: StrategicTask;
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
  modifications?: Partial<StrategicTask>;
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
  intent: StrategicTask['intent'];
  previousActions: MicroAction[];
}