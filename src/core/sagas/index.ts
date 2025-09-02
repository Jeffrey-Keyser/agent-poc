/**
 * Sagas Module
 * 
 * This module provides saga implementations for complex workflow orchestration,
 * compensation logic, and distributed transaction coordination.
 */

import {
  WorkflowSaga,
  WorkflowStep,
  SagaExecution,
  SagaPolicy
} from './workflow-saga';

export {
  WorkflowSaga,
  WorkflowStep,
  SagaExecution,
  SagaPolicy
};

/**
 * Factory for creating sagas
 */
export class SagaFactory {
  /**
   * Create a workflow saga with default configuration
   */
  static createWorkflowSaga(reporter?: any): WorkflowSaga {
    return new WorkflowSaga(reporter);
  }

  /**
   * Create a workflow saga with custom policy
   */
  static createWorkflowSagaWithPolicy(
    reporter: any,
    policy: Partial<SagaPolicy>
  ): WorkflowSaga {
    const defaultPolicy: SagaPolicy = {
      maxWorkflowTimeoutMs: 30 * 60 * 1000,
      maxRetryAttempts: 2,
      enableCompensation: true,
      autoRecovery: true
    };
    
    return new WorkflowSaga(reporter, { ...defaultPolicy, ...policy });
  }
}