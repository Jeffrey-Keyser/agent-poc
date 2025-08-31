// Aggregates - DDD aggregate patterns for coordinating domain entities
export { 
  WorkflowAggregate, 
  StepExecutionResult 
} from './workflow-aggregate';

export { 
  ExecutionAggregate, 
  ExecutionStatistics 
} from './execution-aggregate';

// Supporting entities for aggregates
export { ExecutionContext } from '../entities/execution-context';
export { ExecutionResult } from '../entities/execution-result';