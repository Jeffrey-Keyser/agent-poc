import { LLM } from '../../interfaces/llm.interface';
import { ErrorContext, RetryStrategy } from '../../types/agent-types';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { JsonOutputParser } from '@langchain/core/output_parsers';

/**
 * ErrorHandlerAgent - Analyzes failures and suggests retry strategies
 * 
 * This agent analyzes failed strategic tasks and provides recommendations on:
 * 1. Whether to retry the task (with modifications)
 * 2. Whether to trigger a replan of the entire workflow
 * 3. What modifications might improve success chances
 * 4. When to abandon a failing approach
 */
export class ErrorHandlerAgent {
  public readonly name = 'ErrorHandler';
  public readonly model: string;
  public readonly maxRetries: number;
  
  private llm: LLM;

  constructor(llm: LLM, config: { model: string; maxRetries?: number }) {
    this.llm = llm;
    this.model = config.model;
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * Analyze a failure and suggest retry strategy
   */
  async analyze(context: ErrorContext): Promise<RetryStrategy> {
    const systemMessage = new SystemMessage({ 
      content: this.getSystemPrompt()
    });
    
    const userPrompt = this.buildAnalysisPrompt(context);
    const humanMessage = new HumanMessage({ content: userPrompt });
    
    const parser = new JsonOutputParser<{
      shouldRetry: boolean;
      shouldReplan: boolean;
      delayMs?: number;
      modifications?: any;
      reason: string;
    }>();

    const analysis = await this.llm.invokeAndParse([systemMessage, humanMessage], parser);
    
    return {
      shouldRetry: analysis.shouldRetry,
      shouldReplan: analysis.shouldReplan,
      delayMs: analysis.delayMs || 1000, // Default 1 second delay
      modifications: analysis.modifications,
      reason: analysis.reason
    };
  }

  private getSystemPrompt(): string {
    return `
You are an Error Analysis Agent that determines retry strategies for failed tasks.

DECISION CRITERIA:
1. RETRY if: Temporary issues, network errors, timing problems, minor element changes
2. REPLAN if: Major page changes, wrong approach, fundamental misunderstanding
3. ABANDON if: Repeated failures, impossible requirements, blocked functionality

RETRY STRATEGY RULES:
- Max 3 retries per task
- Add delays for timing issues (500-2000ms)
- Suggest modifications for element targeting issues
- Don't retry if the fundamental approach is wrong

OUTPUT FORMAT:
{
  "shouldRetry": boolean,
  "shouldReplan": boolean, 
  "delayMs": number,
  "modifications": { "targetConcept": "new concept" },
  "reason": "explanation"
}
    `;
  }

  private buildAnalysisPrompt(context: ErrorContext): string {
    return `
FAILURE ANALYSIS:

Task: ${context.task.description}
Intent: ${context.task.intent}
Target: ${context.task.targetConcept}
Expected: ${context.task.expectedOutcome}

Failure Details:
- Status: ${context.result.status}
- Error: ${context.result.errorReason}
- Attempts: ${context.retries}
- Duration: ${context.result.duration}ms

Micro-actions executed:
${context.result.microActions.map(a => `- ${a.type}: ${a.description}`).join('\n')}

Analyze this failure and recommend a strategy.
    `;
  }
}