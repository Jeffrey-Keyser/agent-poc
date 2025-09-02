import {
  EvaluationService,
  EvaluationResult,
  StepEvaluation,
  ScreenshotAnalysis,
  ExtractedData,
  ValidationResult,
  ComparisonResult,
  EvaluationContext,
  ValidationCriteria,
  TaskEvaluation,
  CriticalIssue,
  RecommendedAction,
  StepMetrics,
  TaskPerformance
} from '../../core/domain-services/evaluation-service';
import { Task, Step, Result, TaskResult } from '../../core/entities';
import { Evidence, Confidence, ExtractionSchema } from '../../core/value-objects';
import { LLM } from '../../core/interfaces/llm.interface';
import { TaskEvaluatorAgent } from '../../core/agents/task-evaluator/task-evaluator';
import { EvaluatorConfig } from '../../core/types/agent-types';

/**
 * Infrastructure implementation of EvaluationService that bridges to the existing TaskEvaluatorAgent
 * This service acts as an adapter between the domain service interface and the legacy agent implementation
 */
export class AIEvaluationService implements EvaluationService {
  private taskEvaluatorAgent: TaskEvaluatorAgent;

  constructor(
    llm: LLM,
    config: EvaluatorConfig
  ) {
    this.taskEvaluatorAgent = new TaskEvaluatorAgent(llm, config);
  }

  async evaluateTaskCompletion(
    task: Task,
    evidence: Evidence[],
    context: EvaluationContext
  ): Promise<Result<EvaluationResult>> {
    try {
      if (evidence.length === 0) {
        return Result.fail('No evidence provided for task evaluation');
      }

      // Convert to format expected by TaskEvaluatorAgent
      const evaluatorInput = this.convertToEvaluatorInput(task, evidence, context);
      
      // Use existing TaskEvaluatorAgent
      const evaluatorOutput = await this.taskEvaluatorAgent.execute(evaluatorInput);
      
      if (!evaluatorOutput) {
        return Result.fail(`Evaluation failed: No output returned`);
      }

      // Convert agent output to domain result
      const result = this.convertEvaluatorOutputToResult(evaluatorOutput, evidence, context);
      
      return Result.ok(result);

    } catch (error) {
      return Result.fail(`Task evaluation error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async evaluateStepSuccess(
    step: Step,
    taskResults: TaskResult[],
    context: EvaluationContext
  ): Promise<Result<StepEvaluation>> {
    try {
      if (taskResults.length === 0) {
        return Result.fail('No task results provided for step evaluation');
      }

      const taskEvaluations: TaskEvaluation[] = [];
      const criticalIssues: CriticalIssue[] = [];
      const recommendedActions: RecommendedAction[] = [];

      // Evaluate each task
      const tasks = step.getTasks();
      let overallSuccess = true;
      let totalConfidence = 0;

      for (let i = 0; i < taskResults.length; i++) {
        const taskResult = taskResults[i];
        const task = tasks.find(t => t.getId().toString() === taskResult.taskId);

        if (!task) {
          continue; // Skip if task not found
        }

        // Create task evaluation
        const taskEvaluation = await this.createTaskEvaluation(task, taskResult, context);
        taskEvaluations.push(taskEvaluation);

        if (!taskEvaluation.success) {
          overallSuccess = false;
          
          // Identify critical issues
          const issue: CriticalIssue = {
            severity: taskResult.error ? 'critical' : 'major',
            description: `Task failed: ${taskEvaluation.reasoning}`,
            impact: `Step completion affected`,
            suggestedFix: taskEvaluation.reasoning.includes('timeout') ? 
              'Increase timeout or optimize task' : 'Review task parameters and retry',
            affectedTasks: [task.getId()]
          };
          criticalIssues.push(issue);
        }

        totalConfidence += taskEvaluation.confidence.getValue();
      }

      const averageConfidence = taskResults.length > 0 ? 
        totalConfidence / taskResults.length : 0;

      // Generate recommendations
      if (!overallSuccess) {
        recommendedActions.push({
          type: 'retry',
          description: 'Retry failed tasks with improved parameters',
          priority: 'high',
          estimatedEffort: 'medium'
        });
      }

      if (criticalIssues.length > 2) {
        recommendedActions.push({
          type: 'modify',
          description: 'Step may need restructuring due to multiple failures',
          priority: 'medium',
          estimatedEffort: 'high'
        });
      }

      // Calculate metrics
      const metrics = this.calculateStepMetrics(taskResults, taskEvaluations);

      // Create comprehensive summary
      const summary = this.createStepSummary(overallSuccess, taskEvaluations, criticalIssues);

      const stepEvaluation: StepEvaluation = {
        stepId: step.getId(),
        overallSuccess,
        confidence: Confidence.create(Math.round(averageConfidence)).getValue(),
        taskEvaluations,
        summary,
        criticalIssues,
        recommendedActions,
        metrics
      };

      return Result.ok(stepEvaluation);

    } catch (error) {
      return Result.fail(`Step evaluation error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async analyzeScreenshot(
    screenshotUrl: string,
    expectedOutcome: string,
    context: EvaluationContext
  ): Promise<Result<ScreenshotAnalysis>> {
    try {
      // Use the existing TaskEvaluatorAgent's screenshot analysis capabilities
      const strategicTask = {
        id: 'screenshot-analysis',
        name: 'Screenshot Analysis',
        description: `Analyze screenshot for: ${expectedOutcome}`,
        intent: 'verify' as const,
        targetConcept: expectedOutcome,
        expectedOutcome: `Screenshot should show: ${expectedOutcome}`,
        dependencies: [],
        maxAttempts: 1,
        priority: 1
      };

      const currentPageState = {
        url: context.currentUrl.toString(),
        title: 'Screenshot Analysis',
        visibleSections: [],
        availableActions: []
      };

      const evaluatorInput = {
        step: strategicTask,
        beforeState: currentPageState,
        afterState: currentPageState,
        microActions: [],
        results: [],
        screenshots: {
          before: screenshotUrl,
          after: screenshotUrl
        }
      };

      const evaluatorOutput = await this.taskEvaluatorAgent.execute(evaluatorInput);
      
      // Convert to screenshot analysis format
      const analysis: ScreenshotAnalysis = {
        hasExpectedElements: evaluatorOutput.success && evaluatorOutput.confidence > 70,
        detectedElements: this.extractDetectedElements(evaluatorOutput),
        anomalies: this.extractAnomalies(evaluatorOutput),
        visualChanges: this.extractVisualChanges(evaluatorOutput),
        confidence: Confidence.create(evaluatorOutput.confidence || 50).getValue()
      };

      return Result.ok(analysis);

    } catch (error) {
      return Result.fail(`Screenshot analysis error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async extractStructuredData(
    evidence: Evidence[],
    schema: ExtractionSchema,
    context: EvaluationContext
  ): Promise<Result<ExtractedData>> {
    try {
      if (!schema) {
        return Result.fail('Extraction schema is required');
      }

      // Extract text content from evidence
      const textContent = this.extractTextFromEvidence(evidence);
      if (!textContent) {
        return Result.fail('No text content found in evidence');
      }

      // Use LLM-based extraction (would be enhanced with actual LLM call)
      const extractedData = await this.performDataExtraction(textContent, schema, context);
      
      return Result.ok(extractedData);

    } catch (error) {
      return Result.fail(`Data extraction error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async validateExecutionCriteria(
    results: TaskResult[],
    criteria: ValidationCriteria[],
    context: EvaluationContext
  ): Promise<Result<ValidationResult>> {
    try {
      const criteriaResults: any[] = [];
      let allCriteriaMet = true;
      const criticalFailures: string[] = [];

      for (const criterion of criteria) {
        const result = await this.validateSingleCriterion(criterion, results, context);
        criteriaResults.push(result);

        if (!result.met) {
          allCriteriaMet = false;
          if (criterion.required) {
            criticalFailures.push(`Required criterion not met: ${criterion.type}`);
          }
        }
      }

      const overallConfidence = this.calculateValidationConfidence(criteriaResults);

      const validationResult: ValidationResult = {
        allCriteriaMet,
        results: criteriaResults,
        overallConfidence,
        criticalFailures
      };

      return Result.ok(validationResult);

    } catch (error) {
      return Result.fail(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async compareWithExpected(
    actualEvidence: Evidence[],
    expectedOutcome: string,
    context: EvaluationContext
  ): Promise<Result<ComparisonResult>> {
    try {
      const actualDescription = this.extractDescriptionFromEvidence(actualEvidence);
      
      // Use LLM to compare actual vs expected
      const comparisonResult = await this.performComparison(
        actualDescription,
        expectedOutcome,
        context
      );

      return Result.ok(comparisonResult);

    } catch (error) {
      return Result.fail(`Comparison error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Private helper methods
  private convertToEvaluatorInput(task: Task, evidence: Evidence[], context: EvaluationContext): any {
    // Create the strategic task representation
    const strategicTask = {
      id: task.getId().toString(),
      name: 'Task Evaluation',
      description: task.getDescription(),
      intent: (task.getIntent()?.toString() || 'verify') as 'search' | 'filter' | 'navigate' | 'extract' | 'authenticate' | 'verify' | 'interact',
      targetConcept: this.extractTargetConcept(task.getDescription()),
      expectedOutcome: `Task should complete: ${task.getDescription()}`,
      dependencies: [],
      maxAttempts: 1,
      priority: 1 // Default priority since Priority.getValue() may not exist
    };

    // Create PageState objects for before/after
    const currentPageState = {
      url: context.currentUrl.toString(),
      title: 'Current Page',
      visibleSections: [],
      availableActions: []
    };

    // Return structure matching EvaluatorInput interface
    return {
      step: strategicTask,
      beforeState: currentPageState,
      afterState: currentPageState,
      microActions: [],
      results: [],
      screenshots: {
        before: this.findScreenshotInEvidence(evidence, 'before'),
        after: this.findScreenshotInEvidence(evidence, 'after')
      }
    };
  }

  private convertEvaluatorOutputToResult(
    evaluatorOutput: any, 
    evidence: Evidence[], 
    context: EvaluationContext
  ): EvaluationResult {
    const success = evaluatorOutput.success && evaluatorOutput.confidence > 50;
    
    // Extract structured data if applicable
    let extractedData: ExtractedData | undefined;
    if (evaluatorOutput.extractedData) {
      extractedData = {
        schema: ExtractionSchema.simple('evaluation-data', [{ name: 'result', type: 'string' }]).getValue(),
        data: evaluatorOutput.extractedData,
        confidence: Confidence.create(evaluatorOutput.confidence || 70).getValue(),
        source: context.currentUrl,
        extractedAt: new Date(),
        validationErrors: []
      };
    }

    return {
      success,
      confidence: Confidence.create(evaluatorOutput.confidence || 50).getValue(),
      reasoning: evaluatorOutput.reasoning || 'No reasoning provided',
      evidence: evidence,
      suggestedImprovements: evaluatorOutput.suggestedImprovements || [],
      nextSteps: evaluatorOutput.nextSteps || [],
      dataExtracted: extractedData
    };
  }

  private async createTaskEvaluation(
    task: Task,
    result: TaskResult,
    _context: EvaluationContext
  ): Promise<TaskEvaluation> {
    const performance: TaskPerformance = {
      executionTime: result.duration || 0,
      accuracy: result.success ? 0.9 : 0.3,
      efficiency: result.duration ? (result.duration < 5000 ? 0.9 : 0.6) : 0.5,
      reliability: result.success ? 0.85 : 0.4
    };

    return {
      taskId: task.getId(),
      success: result.success,
      confidence: Confidence.create(result.success ? 80 : 40).getValue(),
      reasoning: result.success ? 'Task completed successfully' : result.error || 'Task failed',
      evidence: [], // Would be populated from actual evidence
      performance
    };
  }

  private calculateStepMetrics(
    taskResults: TaskResult[],
    evaluations: TaskEvaluation[]
  ): StepMetrics {
    const totalTime = taskResults.reduce((sum, r) => sum + (r.duration || 0), 0);
    const successCount = taskResults.filter(r => r.success).length;
    const retryCount = taskResults.length - new Set(taskResults.map(r => r.taskId)).size;
    
    const avgEvidenceQuality = evaluations.length > 0 ?
      evaluations.reduce((sum, e) => sum + e.confidence.getValue(), 0) / evaluations.length : 0;

    return {
      executionTime: totalTime,
      successRate: taskResults.length > 0 ? successCount / taskResults.length : 0,
      retryCount,
      evidenceQuality: avgEvidenceQuality / 100,
      accuracyScore: evaluations.length > 0 ?
        evaluations.reduce((sum, e) => sum + e.performance.accuracy, 0) / evaluations.length : 0
    };
  }

  private createStepSummary(
    success: boolean,
    taskEvaluations: TaskEvaluation[],
    issues: CriticalIssue[]
  ): string {
    const successfulTasks = taskEvaluations.filter(e => e.success).length;
    const totalTasks = taskEvaluations.length;

    let summary = `Step ${success ? 'completed successfully' : 'failed'}. `;
    summary += `${successfulTasks}/${totalTasks} tasks succeeded.`;

    if (issues.length > 0) {
      summary += ` ${issues.length} critical issue${issues.length > 1 ? 's' : ''} identified.`;
    }

    return summary;
  }

  private extractDetectedElements(_evaluatorOutput: any): any[] {
    // Extract detected elements from evaluator output
    // This would be enhanced based on actual evaluator output structure
    return [];
  }

  private extractAnomalies(evaluatorOutput: any): any[] {
    // Extract anomalies from evaluator output
    const anomalies = [];
    
    if (!evaluatorOutput.success) {
      anomalies.push({
        type: 'error-message',
        description: evaluatorOutput.reasoning || 'Evaluation failed',
        severity: 'high'
      });
    }

    return anomalies;
  }

  private extractVisualChanges(_evaluatorOutput: any): any[] {
    // Extract visual changes from evaluator output
    return [];
  }

  private extractTextFromEvidence(evidence: Evidence[]): string {
    return evidence.map(e => e.metadata?.description || '').join(' ');
  }

  private async performDataExtraction(
    content: string,
    schema: ExtractionSchema,
    context: EvaluationContext
  ): Promise<ExtractedData> {
    // Simplified data extraction using schema
    const extractedData: ExtractedData = {
      schema,
      data: { extracted_content: content.substring(0, 200) },
      confidence: Confidence.create(75).getValue(),
      source: context.currentUrl,
      extractedAt: new Date(),
      validationErrors: []
    };

    return extractedData;
  }

  private async validateSingleCriterion(
    criterion: ValidationCriteria,
    results: TaskResult[],
    _context: EvaluationContext
  ): Promise<any> {
    // Simplified validation
    const met = results.some(r => r.success);
    const confidence = met ? Confidence.create(80).getValue() : Confidence.create(60).getValue();

    return {
      criteria: criterion,
      met,
      confidence,
      actualValue: met ? 'Success' : 'Failure'
    };
  }

  private calculateValidationConfidence(results: any[]): Confidence {
    if (results.length === 0) return Confidence.create(50).getValue();

    const avgConfidence = results.reduce((sum, r) => sum + r.confidence.getValue(), 0) / results.length;
    return Confidence.create(Math.round(avgConfidence)).getValue();
  }

  private extractDescriptionFromEvidence(evidence: Evidence[]): string {
    return evidence.map(e => e.metadata?.description || '').join('. ');
  }

  private async performComparison(
    actual: string,
    expected: string,
    _context: EvaluationContext
  ): Promise<ComparisonResult> {
    // Simplified comparison
    const matches = actual.toLowerCase().includes(expected.toLowerCase());
    const confidence = Confidence.create(matches ? 85 : 45).getValue();
    
    const result: ComparisonResult = {
      matches,
      confidence,
      differences: matches ? [] : [{
        aspect: 'content',
        expected,
        actual,
        significance: 'major',
        description: 'Content does not match expected outcome'
      }],
      similarity: matches ? 85 : 30,
      explanation: matches ? 'Actual outcome matches expected result' : 'Significant differences found'
    };

    return result;
  }

  private extractTargetConcept(description: string): string {
    // Simple heuristic to extract target concept from description
    const words = description.toLowerCase().split(' ');
    const concepts = words.filter(word => 
      word.length > 3 && 
      !['the', 'and', 'with', 'from', 'that', 'this', 'will'].includes(word)
    );
    return concepts[0] || 'element';
  }

  private findScreenshotInEvidence(evidence: Evidence[], type?: string): string | undefined {
    const screenshot = evidence.find(e => 
      e.getType() === 'screenshot' && 
      (!type || e.metadata?.description?.includes(type))
    );
    return screenshot?.getValue();
  }
}