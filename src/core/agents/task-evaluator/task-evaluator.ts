import { LLM } from '../../interfaces/llm.interface';
import { ITaskEvaluator, EvaluatorInput, EvaluatorOutput } from '../../interfaces/agent.interface';
import { EvaluatorConfig } from '../../types/agent-types';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { TASK_EVALUATOR_PROMPT } from './task-evaluator.prompt';

/**
 * TaskEvaluatorAgent - Evaluates strategic task completion success
 * 
 * This agent determines whether a strategic task was successfully completed by:
 * 1. Comparing expected outcomes with actual page state changes
 * 2. Analyzing micro-action results and their cumulative effect
 * 3. Looking for user-observable evidence of success
 * 4. Providing confidence scores and reasoning
 * 
 * Key principles:
 * - Focuses on strategic success, not just micro-action execution
 * - Evaluates user-observable outcomes, not technical details
 * - Provides actionable feedback for replanning
 * - Uses conservative confidence scoring
 */
export class TaskEvaluatorAgent implements ITaskEvaluator {
  public readonly name = 'TaskEvaluator';
  public readonly model: string;
  public readonly maxRetries: number;
  
  private llm: LLM;
  constructor(llm: LLM, config: EvaluatorConfig) {
    this.llm = llm;
    this.model = config.model;
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * Evaluate the success of a strategic task execution
   */
  async execute(input: EvaluatorInput): Promise<EvaluatorOutput> {
    if (!this.validateInput(input)) {
      throw new Error('Invalid evaluator input provided');
    }

    const systemMessage = new SystemMessage({ content: TASK_EVALUATOR_PROMPT });
    
    const userPrompt = this.buildEvaluationPrompt(input);
    const messages = [systemMessage];
    
    if (input.screenshots?.before && input.screenshots?.after) {
      messages.push(new HumanMessage({
        content: [
          { type: 'text', text: userPrompt },
          { 
            type: 'image_url', 
            image_url: { 
              url: input.screenshots.before, 
              detail: 'high' 
            } 
          },
          { 
            type: 'image_url', 
            image_url: { 
              url: input.screenshots.after, 
              detail: 'high' 
            } 
          }
        ]
      }));
    } else {
      messages.push(new HumanMessage({ content: userPrompt }));
    }
    
    const parser = new JsonOutputParser<{
      success: boolean;
      confidence: number;
      evidence: string;
      reason: string;
      suggestions?: string[];
      partialSuccess?: boolean;
      achievedAlternative?: string;
    }>();

    const evaluation = await this.llm.invokeAndParse(messages, parser);
    
    const output: EvaluatorOutput = {
      stepId: input.step.id,
      success: evaluation.success,
      confidence: this.validateConfidence(evaluation.confidence),
      evidence: evaluation.evidence || 'No evidence provided',
      reason: evaluation.reason || 'No reason provided',
      suggestions: evaluation.suggestions || []
    };

    // NEW: Add optional fields only if they have values
    if (evaluation.partialSuccess !== undefined) {
      output.partialSuccess = evaluation.partialSuccess;
    }
    if (evaluation.achievedAlternative !== undefined) {
      output.achievedAlternative = evaluation.achievedAlternative;
    }


    if (!this.validateOutput(output)) {
      throw new Error('Generated invalid evaluator output');
    }

    return output;
  }

  validateInput(input: EvaluatorInput): boolean {
    return !!(
      input &&
      input.step &&
      typeof input.step.id === 'string' &&
      typeof input.step.expectedOutcome === 'string' &&
      input.beforeState &&
      input.afterState &&
      Array.isArray(input.microActions) &&
      Array.isArray(input.results)
    );
  }

  validateOutput(output: EvaluatorOutput): boolean {
    return !!(
      output &&
      typeof output.stepId === 'string' &&
      typeof output.success === 'boolean' &&
      typeof output.confidence === 'number' &&
      output.confidence >= 0 &&
      output.confidence <= 1 &&
      typeof output.evidence === 'string' &&
      typeof output.reason === 'string'
    );
  }

  private buildEvaluationPrompt(input: EvaluatorInput): string {
    const { step, beforeState, afterState, microActions, results } = input;

    const microActionsText = microActions.map((action, idx) => {
      const result = results[idx];
      const status = result?.success ? '✅' : '❌';
      return `${status} ${action.type}: ${action.description || 'No description'}${result?.error ? ` (Error: ${result.error})` : ''}`;
    }).join('\n');

    const stateComparison = this.buildStateComparison(beforeState, afterState);
    
    // Special emphasis for extraction tasks
    const extractionGuidance = microActions.some(action => action.type === 'extract') ? `
IMPORTANT: This is an EXTRACTION task. Success is determined by:
1. Whether data was successfully extracted and stored in extractedData
2. The presence of meaningful content in the extracted data
3. The extracted data relates to the expected outcome

Extracted Data Present: ${afterState.extractedData && Object.keys(afterState.extractedData).length > 0 ? 'YES' : 'NO'}
` : '';

    // NEW: Flexible evaluation criteria
    const flexibleCriteria = this.buildFlexibleCriteria(step);

    return `
STRATEGIC TASK EVALUATION:

TASK DETAILS:
- Description: ${step.description}
- Expected Outcome: ${step.expectedOutcome}
${flexibleCriteria}
${extractionGuidance}
EXECUTION RESULTS:
${microActionsText}

STATE COMPARISON:
${stateComparison}

MICRO-ACTION SUCCESS RATE:
${this.calculateSuccessRate(results)} (${results.filter(r => r.success).length}/${results.length} actions succeeded)

${input.screenshots ? 'VISUAL EVIDENCE:\nCompare the before and after screenshots to verify task completion.' : ''}

Based on this information, evaluate whether the STRATEGIC TASK was completed successfully.
${microActions.some(action => action.type === 'extract') ? 'For extraction tasks: If meaningful data was extracted, the task is successful.' : 'Remember: Focus on whether the expected outcome was achieved, not just whether micro-actions executed.'}

Your response must be valid JSON in the specified format.
    `;
  }

  private buildFlexibleCriteria(step: any): string {
    let criteria = '';

    if (step.acceptableOutcomes?.length > 0) {
      criteria += `\nACCEPTABLE ALTERNATIVES:
${step.acceptableOutcomes.map((outcome: string) => `- ${outcome}`).join('\n')}`;
    }

    if (step.requiredEvidence?.length > 0) {
      criteria += `\nREQUIRED EVIDENCE (must be present for success):
${step.requiredEvidence.map((evidence: string) => `- ${evidence}`).join('\n')}`;
    }

    if (step.optionalEvidence?.length > 0) {
      criteria += `\nOPTIONAL EVIDENCE (nice to have):
${step.optionalEvidence.map((evidence: string) => `- ${evidence}`).join('\n')}`;
    }

    if (step.allowPartialSuccess) {
      const minConfidence = step.minSuccessConfidence || 0.5;
      criteria += `\nPARTIAL SUCCESS ALLOWED:
- Minimum confidence threshold: ${minConfidence}
- Can succeed with partial completion if confidence >= ${minConfidence}`;
    }

    return criteria;
  }

  private buildStateComparison(beforeState: any, afterState: any): string {
    const changes = [];

    // URL comparison
    if (beforeState.url !== afterState.url) {
      changes.push(`URL changed: ${beforeState.url} → ${afterState.url}`);
    } else {
      changes.push(`URL unchanged: ${afterState.url}`);
    }

    // Title comparison
    if (beforeState.title !== afterState.title) {
      changes.push(`Title changed: "${beforeState.title}" → "${afterState.title}"`);
    }

    // Visible sections comparison
    const beforeSections = new Set(beforeState.visibleSections || []);
    const afterSections = new Set(afterState.visibleSections || []);
    
    const newSections = [...afterSections].filter(s => !beforeSections.has(s));
    const removedSections = [...beforeSections].filter(s => !afterSections.has(s));

    if (newSections.length > 0) {
      changes.push(`New sections appeared: ${newSections.join(', ')}`);
    }
    if (removedSections.length > 0) {
      changes.push(`Sections disappeared: ${removedSections.join(', ')}`);
    }

    // Available actions comparison
    const beforeActions = new Set(beforeState.availableActions || []);
    const afterActions = new Set(afterState.availableActions || []);
    
    const newActions = [...afterActions].filter(a => !beforeActions.has(a));
    if (newActions.length > 0) {
      changes.push(`New actions available: ${newActions.join(', ')}`);
    }

    // Extracted data - Give this special attention for extraction tasks
    if (afterState.extractedData && Object.keys(afterState.extractedData).length > 0) {
      const dataKeys = Object.keys(afterState.extractedData);
      const dataPreview = JSON.stringify(afterState.extractedData).substring(0, 500);
      changes.push(`✅ Data successfully extracted (${dataKeys.length} keys): ${dataKeys.join(', ')}`);
      changes.push(`Data preview: ${dataPreview}${dataPreview.length >= 500 ? '...' : ''}`);
    } else if (beforeState.extractedData && !afterState.extractedData) {
      changes.push(`⚠️ Previously extracted data was lost`);
    }

    return changes.length > 0 ? changes.join('\n') : 'No significant state changes detected';
  }

  private calculateSuccessRate(results: any[]): string {
    if (results.length === 0) return '0%';
    const successCount = results.filter(r => r.success).length;
    const percentage = Math.round((successCount / results.length) * 100);
    return `${percentage}%`;
  }

  private validateConfidence(confidence: number): number {
    // Ensure confidence is between 0 and 1
    if (typeof confidence !== 'number' || isNaN(confidence)) {
      return 0.5; // Default to moderate confidence
    }
    return Math.max(0, Math.min(1, confidence));
  }
}