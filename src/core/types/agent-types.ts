import { MicroActionData, Variable } from '../value-objects';
import { OpenAIModel } from '@/models/chat-openai';
import { Task } from '../entities/task';
import { Browser } from '../interfaces/browser.interface';
import { DomService } from '@/infra/services/dom-service';
import { VariableManager } from '../services/variable-manager';
import { LLM } from '../types';


export interface StepResult {
  stepId: string;
  status: 'success' | 'failure' | 'partial';
  success: boolean;
  microActions: MicroActionData[];
  evidence: {
    beforeState?: PageState;
    afterState?: PageState;
    extractedData?: any;
  };
  errorReason?: string;
  duration: number;
  attempts: number;
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
  llm: LLM;
  browser: Browser;
  domService: DomService;
  variableManager?: VariableManager;
  maxRetries?: number;
}

export interface EvaluatorConfig {
  llm: LLM;
  maxRetries?: number;
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

export interface ErrorContext {
  task: Task;
  result: StepResult;
  retries: number;
  timestamp: Date;
}


export interface RetryStrategy {
  shouldRetry: boolean;
  shouldReplan: boolean;
  delayMs: number;
  modifications?: Partial<Task>;
  reason: string;
}
