import { LLM } from '../../interfaces/llm.interface';
import { ITaskSummarizer, SummarizerInput, SummarizerOutput } from '../../interfaces/agent.interface';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { TASK_SUMMARIZER_PROMPT } from './task-summarizer.prompt';

export interface SummarizerConfig {
  llm: LLM;
  maxRetries?: number;
  includeRecommendations?: boolean;     // Default: true
  maxSummaryLength?: number;            // Default: 500 characters
}

/**
 * TaskSummarizerAgent - Creates structured summaries from workflow results
 * 
 * This agent processes raw workflow output and creates clean, consumable summaries.
 * It's especially important for extraction workflows where data often contains
 * HTML, CSS, and JavaScript artifacts that need to be cleaned.
 * 
 * Key responsibilities:
 * - Clean extracted data (remove CSS, JS, excessive HTML)
 * - Structure findings into categories
 * - Calculate performance metrics
 * - Generate actionable summaries
 */
export class TaskSummarizerAgent implements ITaskSummarizer {
  public readonly name = 'TaskSummarizer';
  public readonly maxRetries: number;
  
  private llm: LLM;
  private config: SummarizerConfig;
  
  constructor(llm: LLM, config: SummarizerConfig) {
    this.llm = llm;
    this.maxRetries = config.maxRetries || 3;
    this.config = {
      includeRecommendations: true,
      maxSummaryLength: 500,
      ...config
    };
  }

  /**
   * Execute summarization of workflow results
   */
  async execute(input: SummarizerInput): Promise<SummarizerOutput> {
    if (!this.validateInput(input)) {
      throw new Error('Invalid summarizer input provided');
    }

    const systemMessage = new SystemMessage({ content: TASK_SUMMARIZER_PROMPT });
    const userPrompt = this.buildUserPrompt(input, input.extractedData);
    const messages = [systemMessage, new HumanMessage({ content: userPrompt })];
    
    const parser = new JsonOutputParser<any>();
    const response = await this.llm.invokeAndParse(messages, parser);
    
    const output = this.buildOutput(input, response);
    if (!this.validateOutput(output)) {
      throw new Error('Generated invalid summarizer output');
    }

    return output;
  }

  /**
   * Build the prompt for the LLM
   */
  private buildUserPrompt(input: SummarizerInput, rawData: Record<string, any>): string {
    const successfulSteps = input.completedSteps.filter(s => s.success).length;
    const failedSteps = input.completedSteps.length - successfulSteps;
    
    return `
Please create a structured summary of this workflow execution:

WORKFLOW GOAL: ${input.goal}

EXECUTION SUMMARY:
- Total Steps: ${input.plan.length}
- Completed Steps: ${successfulSteps}
- Failed Steps: ${failedSteps}
- Duration: ${this.formatDuration(input.totalDuration)}
- Final URL: ${input.url || 'Not provided'}

STRATEGIC PLAN:
${input.plan.map((task, i) => `${i + 1}. ${task.description} - ${task.expectedOutcome}`).join('\n')}

STEP RESULTS:
${input.completedSteps.map(step => 
  `- Step ${step.stepId}: ${step.status === 'success' ? '✓ Success' : '✗ Failed'} ${step.errorReason || ''}`
).join('\n')}

EXTRACTED DATA:
${JSON.stringify(rawData, null, 2)}

${input.errors && input.errors.length > 0 ? `
ERRORS ENCOUNTERED:
${input.errors.join('\n')}
` : ''}

Please provide a structured summary following the format specified in your instructions.
${this.config.includeRecommendations ? 'Include recommendations for improving future runs.' : ''}
Focus on extracting clean, actionable data from the results.
`;
  }

  /**
   * Build the final output structure
   */
  private buildOutput(input: SummarizerInput, llmResponse: any): SummarizerOutput {
    const workflowId = `workflow-${Date.now()}`;
    const totalSteps = input.plan.length;
    const successfulSteps = input.completedSteps.filter(s => s.status === 'success').length;
    const failedSteps = input.completedSteps.filter(s => s.status !== 'success').length;
    
    // Determine status
    let status: 'completed' | 'partial' | 'failed';
    if (successfulSteps === totalSteps) {
      status = 'completed';
    } else if (successfulSteps === 0) {
      status = 'failed';
    } else {
      status = 'partial';
    }
    
    return {
      workflowId,
      objective: input.goal,
      status,
      summary: llmResponse.summary || this.generateDefaultSummary(input, status),
      extractedFields: llmResponse.extractedFields || [],
      performanceMetrics: {
        totalSteps,
        successfulSteps,
        failedSteps,
        duration: this.formatDuration(input.totalDuration)
      },
      timestamp: new Date(),
      rawDataAvailable: true
    };
  }

  /**
   * Generate a default summary if LLM fails
   */
  private generateDefaultSummary(input: SummarizerInput, status: string): string {
    const successCount = input.completedSteps.filter(s => s.success).length;
    return `Workflow ${status} with ${successCount}/${input.plan.length} steps completed in ${this.formatDuration(input.totalDuration)}. Goal: ${input.goal}`;
  }

  /**
   * Format duration from milliseconds to human-readable
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  /**
   * Validate input data
   */
  validateInput(input: SummarizerInput): boolean {
    return !!(
      input &&
      input.goal &&
      input.plan &&
      Array.isArray(input.plan) &&
      input.completedSteps &&
      Array.isArray(input.completedSteps) &&
      input.startTime &&
      input.endTime &&
      input.completedSteps.every(step => 
        step.stepId && 
        step.status && 
        typeof step.duration === 'number'
      )
    );
  }

  /**
   * Validate output data
   */
  validateOutput(output: SummarizerOutput): boolean {
    return !!(
      output &&
      output.workflowId &&
      output.objective &&
      output.status &&
      output.summary &&
      output.extractedFields &&
      Array.isArray(output.extractedFields) &&
      output.performanceMetrics &&
      output.timestamp
    );
  }
}