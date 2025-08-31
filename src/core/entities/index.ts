// Core utility classes
export { Result } from './result';

// Status types and enums
export * from './status-types';

// Domain entities
export { 
  Workflow,
  ExecutionHistory,
  WorkflowStartedEvent,
  WorkflowCompletedEvent,
  WorkflowFailedEvent
} from './workflow';

export { Plan } from './plan';

export { 
  Task,
  TaskExecutionContext
} from './task';

export { Step } from './step';

export { 
  Session,
  SessionMetrics,
  SessionError
} from './session';

export { ExecutionContext } from './execution-context';

export { ExecutionResult } from './execution-result';

// Legacy exports (maintained for backward compatibility)
// These should be imported from value-objects instead
export { Variable } from './variable';
export { VariableString } from './variable-string';
export { OpenatorResult } from './openator-result';