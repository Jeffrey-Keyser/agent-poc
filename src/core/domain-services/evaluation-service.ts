import { Task, Step, Result, TaskResult } from '../entities';
import { TaskId, StepId, Evidence, Confidence, Url, PageState, ExtractionSchema } from '../value-objects';

// Evaluation result for task completion
export interface EvaluationResult {
  success: boolean;
  confidence: Confidence;
  reasoning: string;
  evidence: Evidence[];
  suggestedImprovements: string[];
  nextSteps?: string[];
  dataExtracted: ExtractedData | undefined;
}

// Evaluation result for step success
export interface StepEvaluation {
  stepId: StepId;
  overallSuccess: boolean;
  confidence: Confidence;
  taskEvaluations: TaskEvaluation[];
  summary: string;
  criticalIssues: CriticalIssue[];
  recommendedActions: RecommendedAction[];
  metrics: StepMetrics;
}

export interface TaskEvaluation {
  taskId: TaskId;
  success: boolean;
  confidence: Confidence;
  reasoning: string;
  evidence: Evidence[];
  performance: TaskPerformance;
}

export interface CriticalIssue {
  severity: 'critical' | 'major' | 'minor';
  description: string;
  impact: string;
  suggestedFix: string;
  affectedTasks: TaskId[];
}

export interface RecommendedAction {
  type: 'retry' | 'modify' | 'skip' | 'investigate';
  description: string;
  priority: 'high' | 'medium' | 'low';
  estimatedEffort: 'low' | 'medium' | 'high';
}

export interface StepMetrics {
  executionTime: number;
  successRate: number;
  retryCount: number;
  evidenceQuality: number;
  accuracyScore: number;
}

export interface TaskPerformance {
  executionTime: number;
  accuracy: number;
  efficiency: number;
  reliability: number;
}

// Data extraction result
export interface ExtractedData {
  schema: ExtractionSchema;
  data: Record<string, any>;
  confidence: Confidence;
  source: Url;
  extractedAt: Date;
  validationErrors: ValidationError[];
}

export interface ValidationError {
  field: string;
  expected: string;
  actual: string;
  severity: 'error' | 'warning';
}

export interface EvaluationContext {
  originalGoal: string;
  currentUrl: Url;
  pageState?: PageState;
  expectedOutcome?: string;
  validationCriteria?: ValidationCriteria[];
  timeConstraints?: number;
}

export interface ValidationCriteria {
  type: 'presence' | 'content' | 'navigation' | 'extraction';
  selector?: string;
  expectedValue?: string;
  tolerance?: number;
  required: boolean;
}

// Screenshot analysis result
export interface ScreenshotAnalysis {
  hasExpectedElements: boolean;
  detectedElements: DetectedElement[];
  anomalies: Anomaly[];
  visualChanges: VisualChange[];
  confidence: Confidence;
}

export interface DetectedElement {
  type: 'button' | 'input' | 'link' | 'text' | 'image' | 'form' | 'modal' | 'navigation';
  coordinates: { x: number; y: number; width: number; height: number };
  confidence: number;
  text?: string;
  interactable: boolean;
}

export interface Anomaly {
  type: 'error-message' | 'loading-indicator' | 'popup' | 'overlay' | 'broken-layout';
  description: string;
  severity: 'low' | 'medium' | 'high';
  coordinates?: { x: number; y: number; width: number; height: number };
}

export interface VisualChange {
  type: 'content-change' | 'layout-change' | 'new-element' | 'removed-element';
  description: string;
  confidence: number;
  significant: boolean;
}

/**
 * Domain service interface for evaluation operations.
 * Handles the complex domain logic of evaluating task and step completion.
 */
export interface EvaluationService {
  /**
   * Evaluates whether a task has been completed successfully
   */
  evaluateTaskCompletion(
    task: Task,
    evidence: Evidence[],
    context: EvaluationContext
  ): Promise<Result<EvaluationResult>>;

  /**
   * Evaluates the overall success of a step based on task results
   */
  evaluateStepSuccess(
    step: Step,
    taskResults: TaskResult[],
    context: EvaluationContext
  ): Promise<Result<StepEvaluation>>;

  /**
   * Analyzes screenshots to determine task completion
   */
  analyzeScreenshot(
    screenshotUrl: string,
    expectedOutcome: string,
    context: EvaluationContext
  ): Promise<Result<ScreenshotAnalysis>>;

  /**
   * Extracts structured data from evidence based on schema
   */
  extractStructuredData(
    evidence: Evidence[],
    schema: ExtractionSchema,
    context: EvaluationContext
  ): Promise<Result<ExtractedData>>;

  /**
   * Validates that execution meets specified criteria
   */
  validateExecutionCriteria(
    results: TaskResult[],
    criteria: ValidationCriteria[],
    context: EvaluationContext
  ): Promise<Result<ValidationResult>>;

  /**
   * Compares current state with expected outcome
   */
  compareWithExpected(
    actualEvidence: Evidence[],
    expectedOutcome: string,
    context: EvaluationContext
  ): Promise<Result<ComparisonResult>>;
}

export interface ValidationResult {
  allCriteriaMet: boolean;
  results: CriteriaResult[];
  overallConfidence: Confidence;
  criticalFailures: string[];
}

export interface CriteriaResult {
  criteria: ValidationCriteria;
  met: boolean;
  confidence: Confidence;
  actualValue?: string;
  deviation?: number;
}

export interface ComparisonResult {
  matches: boolean;
  confidence: Confidence;
  differences: Difference[];
  similarity: number; // 0-100%
  explanation: string;
}

export interface Difference {
  aspect: 'content' | 'structure' | 'behavior' | 'appearance';
  expected: string;
  actual: string;
  significance: 'critical' | 'major' | 'minor' | 'cosmetic';
  description: string;
}

/**
 * AI-powered implementation of the Evaluation Service using LLM and computer vision
 */
export class AIEvaluationService implements EvaluationService {
  constructor(
    // private readonly _llm: LLM,
    // private readonly _screenshotService?: ScreenshotService,
    private readonly _visionService?: VisionAnalysisService
  ) {
    // Services are injected and available for use
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

      // Analyze evidence quality
      const evidenceQuality = this.calculateEvidenceQuality(evidence);
      if (evidenceQuality < 0.5) {
        return Result.ok({
          success: false,
          confidence: Confidence.create(30).getValue(),
          reasoning: 'Insufficient or poor quality evidence for reliable evaluation',
          evidence: evidence,
          suggestedImprovements: [
            'Collect more comprehensive evidence',
            'Improve screenshot quality',
            'Capture multiple verification points'
          ],
          nextSteps: ['Retry with better evidence collection'],
          dataExtracted: undefined
        });
      }

      // Use LLM to analyze task completion
      const analysisResult = await this.analyzeTaskWithLLM(task, evidence, context);
      if (analysisResult.isFailure()) {
        return Result.fail(`LLM analysis failed: ${analysisResult.getError()}`);
      }

      const analysis = analysisResult.getValue();

      // Enhanced confidence calculation
      const baseConfidence = analysis.confidence.getValue();
      const evidenceBonus = Math.min(20, evidence.length * 5); // Up to 20 points for evidence
      const finalConfidence = Math.min(100, baseConfidence + evidenceBonus);

      // Extract structured data if applicable
      let extractedData: ExtractedData | undefined;
      if (this.taskInvolvesDataExtraction(task)) {
        const extractionResult = await this.attemptDataExtraction(evidence, context);
        if (extractionResult.isSuccess()) {
          extractedData = extractionResult.getValue();
        }
      }

      const result: EvaluationResult = {
        success: analysis.success,
        confidence: Confidence.create(finalConfidence).getValue(),
        reasoning: analysis.reasoning,
        evidence: evidence,
        suggestedImprovements: analysis.suggestedImprovements,
        nextSteps: analysis.nextSteps,
        dataExtracted: extractedData || undefined
      };

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
      if (!this._visionService) {
        return Result.fail('Vision analysis service not available');
      }

      // Analyze screenshot using vision service
      const visionResult = await this._visionService.analyzeImage(
        screenshotUrl,
        expectedOutcome,
        context
      );

      if (visionResult.isFailure()) {
        return Result.fail(`Vision analysis failed: ${visionResult.getError()}`);
      }

      return Result.ok(visionResult.getValue());

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

      // Use LLM to extract structured data
      const extractionResult = await this.extractDataWithLLM(textContent, schema, context);
      if (extractionResult.isFailure()) {
        return Result.fail(`Data extraction failed: ${extractionResult.getError()}`);
      }

      return Result.ok(extractionResult.getValue());

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
      const criteriaResults: CriteriaResult[] = [];
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
      const comparisonResult = await this.compareWithLLM(
        actualDescription,
        expectedOutcome,
        context
      );

      if (comparisonResult.isFailure()) {
        return Result.fail(`Comparison failed: ${comparisonResult.getError()}`);
      }

      return Result.ok(comparisonResult.getValue());

    } catch (error) {
      return Result.fail(`Comparison error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Private helper methods
  private calculateEvidenceQuality(evidence: Evidence[]): number {
    if (evidence.length === 0) return 0;

    const avgConfidence = evidence.reduce((sum, e) => sum + (e.getConfidence() || 0), 0) / evidence.length;
    const diversityBonus = Math.min(0.2, evidence.length * 0.05); // Bonus for multiple evidence types
    
    return Math.min(1.0, (avgConfidence / 100) + diversityBonus);
  }

  private async analyzeTaskWithLLM(
    _task: Task,
    evidence: Evidence[],
    _context: EvaluationContext
  ): Promise<Result<{ success: boolean; confidence: Confidence; reasoning: string; suggestedImprovements: string[]; nextSteps: string[]; }>> {
    // This would use the LLM to analyze task completion
    // For now, providing a simplified implementation
    const success = evidence.some(e => (e.getConfidence() || 0) > 70);
    const confidence = success ? Confidence.create(85).getValue() : Confidence.create(40).getValue();

    const reasoning = success ?
      'Task appears to have completed successfully based on evidence' :
      'Task completion is uncertain due to low-confidence evidence';

    const suggestedImprovements = success ? [] : [
      'Collect additional verification evidence',
      'Improve task execution accuracy',
      'Extend timeout if needed'
    ];

    const nextSteps = success ? ['Proceed to next step'] : ['Retry task with improvements'];

    return Result.ok({
      success,
      confidence,
      reasoning,
      suggestedImprovements,
      nextSteps
    });
  }

  private taskInvolvesDataExtraction(task: Task): boolean {
    const description = task.getDescription().toLowerCase();
    return description.includes('extract') || 
           description.includes('scrape') || 
           description.includes('collect') ||
           description.includes('gather');
  }

  private async attemptDataExtraction(
    evidence: Evidence[],
    context: EvaluationContext
  ): Promise<Result<ExtractedData>> {
    const textContent = this.extractTextFromEvidence(evidence);
    
    const extractedData: ExtractedData = {
      schema: ExtractionSchema.simple('content-extraction', [{ name: 'content', type: 'string' }]).getValue(),
      data: { content: textContent },
      confidence: Confidence.create(70).getValue(),
      source: context.currentUrl,
      extractedAt: new Date(),
      validationErrors: []
    };

    return Result.ok(extractedData);
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

  private async validateSingleCriterion(
    criterion: ValidationCriteria,
    results: TaskResult[],
    _context: EvaluationContext
  ): Promise<CriteriaResult> {
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

  private calculateValidationConfidence(results: CriteriaResult[]): Confidence {
    if (results.length === 0) return Confidence.create(50).getValue();

    const avgConfidence = results.reduce((sum, r) => sum + r.confidence.getValue(), 0) / results.length;
    return Confidence.create(Math.round(avgConfidence)).getValue();
  }

  private extractTextFromEvidence(evidence: Evidence[]): string {
    return evidence.map(e => e.metadata.description || '').join(' ');
  }

  private extractDescriptionFromEvidence(evidence: Evidence[]): string {
    return evidence.map(e => e.metadata.description || '').join('. ');
  }

  private async compareWithLLM(
    actual: string,
    expected: string,
    _context: EvaluationContext
  ): Promise<Result<ComparisonResult>> {
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

    return Result.ok(result);
  }

  private async extractDataWithLLM(
    content: string,
    schema: ExtractionSchema,
    context: EvaluationContext
  ): Promise<Result<ExtractedData>> {
    // Simplified data extraction using schema
    const extractedData: ExtractedData = {
      schema,
      data: { extracted_content: content.substring(0, 200) },
      confidence: Confidence.create(75).getValue(),
      source: context.currentUrl,
      extractedAt: new Date(),
      validationErrors: []
    };

    return Result.ok(extractedData);
  }
}

// Supporting service interfaces
export interface ScreenshotService {
  takeScreenshot(): Promise<string>;
  compareScreenshots(url1: string, url2: string): Promise<number>;
}

export interface VisionAnalysisService {
  analyzeImage(
    imageUrl: string,
    expectedOutcome: string,
    context: EvaluationContext
  ): Promise<Result<ScreenshotAnalysis>>;
}