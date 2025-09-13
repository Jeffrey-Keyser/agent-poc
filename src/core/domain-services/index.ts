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
} from './planning-service';

// Execution Domain Service - Handles task and step execution in web automation
export {
  ExecutionService,
  TaskExecutionContext,
  ExecutionAction,
  EnhancedTaskResult,
  ExecutionError,
  StepExecutionConfig,
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

export { WorkflowOrchestrator } from './workflow-orchestrator';
export { WorkflowPlanningService } from './workflow-planning-service';
export { 
  WorkflowEventCoordinator,
  EventCoordinatorConfig,
  EventMetrics,
  WorkflowEventCallbacks 
} from './workflow-event-coordinator';
export { 
  WorkflowStateCoordinator,
  StateContext 
} from './workflow-state-coordinator';

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