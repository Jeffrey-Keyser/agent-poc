// Domain Services - High-level coordination services that implement complex business workflows
// These services coordinate between aggregates, entities, and value objects to accomplish business goals

// Planning Domain Service - Creates and refines execution plans
export {
  PlanningService,
  AITaskPlanningService,
  PlanningContext,
  EvaluationFeedback,
  StepDecompositionResult,
  PlanValidationResult,
  ValidationIssue,
  PlanComplexityEstimate,
  MemoryService,
  LearnedPattern
} from './planning-service';

// Execution Domain Service - Handles task and step execution in web automation
export {
  ExecutionService,
  BrowserExecutionService,
  TaskExecutionContext,
  ExecutionAction,
  EnhancedTaskResult,
  ExecutionError,
  StepExecutionConfig,
  ExecutionValidation,
  RecoveryAction,
  DOMService
} from './execution-service';

// Evaluation Domain Service - Evaluates task completion and workflow success  
export {
  EvaluationService,
  AIEvaluationService,
  EvaluationResult,
  StepEvaluation,
  TaskEvaluation,
  CriticalIssue,
  RecommendedAction,
  StepMetrics,
  TaskPerformance,
  ExtractedData,
  ValidationError,
  EvaluationContext,
  ValidationCriteria,
  ScreenshotAnalysis,
  DetectedElement,
  Anomaly,
  VisualChange,
  ValidationResult,
  CriteriaResult,
  ComparisonResult,
  Difference,
  ScreenshotService,
  VisionAnalysisService
} from './evaluation-service';

// Workflow Orchestration Service - Coordinates all domain services for complete workflow execution
export {
  WorkflowOrchestrationService,
  OrchestrationConfig,
  ErrorRecoveryStrategy,
  OrchestrationContext,
  OrchestrationMetrics,
  OrchestrationError,
  ExecutionPhase,
  ExecutionStatus,
  HealthStatus,
  ExecutionIssue,
  EnhancedWorkflowResult,
  ExecutionPhaseRecord,
  PlanEvolutionRecord,
  PlanChange,
  AdaptationRecord,
  ExecutionReport,
  ErrorHandlingService
} from './workflow-orchestration-service';

// Re-export key interfaces and types from entities and value objects for convenience
export { Result } from '../entities/result';
export { 
  WorkflowId, 
  PlanId, 
  StepId, 
  TaskId, 
  Confidence, 
  Duration, 
  Priority,
  Evidence,
  ExtractionSchema 
} from '../value-objects';
export { 
  Workflow, 
  Plan, 
  Step, 
  Task, 
  WorkflowResult,
  TaskResult,
  StepResult,
  ExecutionContext 
} from '../entities';