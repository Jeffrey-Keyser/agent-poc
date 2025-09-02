/**
 * Workflow Saga
 * 
 * This saga coordinates complex workflow operations that span multiple aggregates
 * and handles compensation logic, timeout scenarios, and workflow recovery.
 */

import { 
  BaseEventHandler, 
  DomainEvent,
  WorkflowStartedEvent,
  WorkflowCompletedEvent,
  WorkflowFailedEvent,
  TaskFailedEvent,
  TaskCompletedEvent,
  EventTypes
} from '../domain-events';
import { AgentReporter } from '../interfaces/agent-reporter.interface';

export interface WorkflowStep {
  stepId: string;
  stepType: 'planning' | 'execution' | 'evaluation' | 'compensation';
  description: string;
  timeoutMs: number;
  maxRetries: number;
  compensationSteps?: WorkflowStep[];
  dependencies?: string[];
}

export interface SagaExecution {
  sagaId: string;
  workflowId: string;
  startedAt: Date;
  currentStep?: WorkflowStep;
  completedSteps: string[];
  failedSteps: string[];
  isComplete: boolean;
  isFailed: boolean;
  isCompensating: boolean;
  timeoutAt: Date;
  retryCount: number;
  lastErrorMessage?: string;
}

export interface SagaPolicy {
  maxWorkflowTimeoutMs: number;
  maxRetryAttempts: number;
  enableCompensation: boolean;
  autoRecovery: boolean;
}

/**
 * Workflow Saga that orchestrates complex multi-step workflows
 */
export class WorkflowSaga extends BaseEventHandler {
  protected eventTypes = [
    EventTypes.WORKFLOW_STARTED,
    EventTypes.WORKFLOW_COMPLETED,
    EventTypes.WORKFLOW_FAILED,
    EventTypes.TASK_COMPLETED,
    EventTypes.TASK_FAILED
  ];

  private activeExecutions = new Map<string, SagaExecution>();
  private timeoutHandles = new Map<string, NodeJS.Timeout>();
  private policy: SagaPolicy;

  constructor(
    private reporter?: AgentReporter,
    policy: SagaPolicy = {
      maxWorkflowTimeoutMs: 30 * 60 * 1000,
      maxRetryAttempts: 2,
      enableCompensation: true,
      autoRecovery: true
    }
  ) {
    super();
    this.policy = policy;
  }

  async handle(event: DomainEvent): Promise<void> {
    switch (event.eventType) {
      case EventTypes.WORKFLOW_STARTED:
        await this.handleWorkflowStarted(event as WorkflowStartedEvent);
        break;
      case EventTypes.WORKFLOW_COMPLETED:
        await this.handleWorkflowCompleted(event as WorkflowCompletedEvent);
        break;
      case EventTypes.WORKFLOW_FAILED:
        await this.handleWorkflowFailed(event as WorkflowFailedEvent);
        break;
      case EventTypes.TASK_COMPLETED:
        await this.handleTaskCompleted(event as TaskCompletedEvent);
        break;
      case EventTypes.TASK_FAILED:
        await this.handleTaskFailed(event as TaskFailedEvent);
        break;
    }
  }

  private async handleWorkflowStarted(event: WorkflowStartedEvent): Promise<void> {
    const workflowId = event.aggregateId;
    const sagaId = `saga-${workflowId}-${Date.now()}`;
    
    const execution: SagaExecution = {
      sagaId,
      workflowId,
      startedAt: new Date(),
      completedSteps: [],
      failedSteps: [],
      isComplete: false,
      isFailed: false,
      isCompensating: false,
      timeoutAt: new Date(Date.now() + this.policy.maxWorkflowTimeoutMs),
      retryCount: 0
    };

    this.activeExecutions.set(workflowId, execution);
    this.scheduleTimeout(execution);
    
    this.reporter?.log(`🔄 Workflow saga started: ${sagaId} for workflow ${workflowId}`);
  }

  private async handleWorkflowCompleted(event: WorkflowCompletedEvent): Promise<void> {
    const workflowId = event.aggregateId;
    const execution = this.activeExecutions.get(workflowId);
    
    if (execution) {
      execution.isComplete = true;
      this.clearTimeout(workflowId);
      this.activeExecutions.delete(workflowId);
      
      this.reporter?.log(`✅ Workflow saga completed: ${execution.sagaId}`);
      
      // Calculate and log execution statistics
      const duration = new Date().getTime() - execution.startedAt.getTime();
      this.reporter?.log(`📊 Saga execution stats:`);
      this.reporter?.log(`   Duration: ${Math.round(duration / 1000)}s`);
      this.reporter?.log(`   Completed Steps: ${execution.completedSteps.length}`);
      this.reporter?.log(`   Failed Steps: ${execution.failedSteps.length}`);
      this.reporter?.log(`   Retry Count: ${execution.retryCount}`);
    }
  }

  private async handleWorkflowFailed(event: WorkflowFailedEvent): Promise<void> {
    const workflowId = event.aggregateId;
    const execution = this.activeExecutions.get(workflowId);
    
    if (execution && !execution.isComplete) {
      execution.isFailed = true;
      execution.lastErrorMessage = (event as any).reason || 'Unknown error';
      
      this.reporter?.log(`❌ Workflow saga failed: ${execution.sagaId}`);
      this.reporter?.log(`   Reason: ${execution.lastErrorMessage}`);
      
      if (this.policy.enableCompensation && !execution.isCompensating) {
        await this.startCompensation(execution);
      } else if (this.policy.autoRecovery && execution.retryCount < this.policy.maxRetryAttempts) {
        await this.attemptRecovery(execution);
      } else {
        await this.terminateSaga(execution);
      }
    }
  }

  private async handleTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    const workflowId = (event as any).workflowId?.toString?.();
    if (!workflowId) return;
    
    const execution = this.activeExecutions.get(workflowId);
    if (execution) {
      const taskId = event.aggregateId;
      execution.completedSteps.push(taskId);
      
      // Update progress tracking
      this.updateSagaProgress(execution);
    }
  }

  private async handleTaskFailed(event: TaskFailedEvent): Promise<void> {
    const workflowId = (event as any).workflowId?.toString?.();
    if (!workflowId) return;
    
    const execution = this.activeExecutions.get(workflowId);
    if (execution) {
      const taskId = event.aggregateId;
      execution.failedSteps.push(taskId);
      execution.lastErrorMessage = (event as any).reason || 'Task failed';
      
      this.reporter?.log(`⚠️ Task failed in saga ${execution.sagaId}: ${taskId}`);
      
      // Evaluate if saga should continue or start compensation
      await this.evaluateSagaContinuation(execution);
    }
  }

  private scheduleTimeout(execution: SagaExecution): void {
    const timeoutMs = execution.timeoutAt.getTime() - Date.now();
    
    if (timeoutMs > 0) {
      const timeoutHandle = setTimeout(async () => {
        await this.handleSagaTimeout(execution);
      }, timeoutMs);
      
      this.timeoutHandles.set(execution.workflowId, timeoutHandle);
    }
  }

  private clearTimeout(workflowId: string): void {
    const timeoutHandle = this.timeoutHandles.get(workflowId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.timeoutHandles.delete(workflowId);
    }
  }

  private async handleSagaTimeout(execution: SagaExecution): Promise<void> {
    this.reporter?.log(`⏰ Saga timeout: ${execution.sagaId}`);
    
    execution.lastErrorMessage = 'Saga execution timeout';
    
    if (this.policy.enableCompensation) {
      await this.startCompensation(execution);
    } else {
      await this.terminateSaga(execution);
    }
  }

  private async startCompensation(execution: SagaExecution): Promise<void> {
    execution.isCompensating = true;
    
    this.reporter?.log(`🔄 Starting compensation for saga: ${execution.sagaId}`);
    this.reporter?.log(`   Completed steps to compensate: ${execution.completedSteps.length}`);
    
    // TODO: In a real implementation, this would:
    // 1. Execute compensation steps in reverse order
    // 2. Clean up any side effects
    // 3. Rollback changes where possible
    // 4. Notify stakeholders of compensation completion
    
    // For now, we simulate compensation completion
    setTimeout(async () => {
      await this.completeCompensation(execution);
    }, 5000);
  }

  private async completeCompensation(execution: SagaExecution): Promise<void> {
    this.reporter?.log(`✅ Compensation completed for saga: ${execution.sagaId}`);
    await this.terminateSaga(execution);
  }

  private async attemptRecovery(execution: SagaExecution): Promise<void> {
    execution.retryCount++;
    
    this.reporter?.log(`🔄 Attempting recovery for saga: ${execution.sagaId} (attempt ${execution.retryCount})`);
    
    // Reset failure state for recovery attempt
    execution.isFailed = false;
    delete execution.lastErrorMessage;
    
    // TODO: In a real implementation, this would:
    // 1. Analyze the failure point
    // 2. Apply recovery strategies (e.g., replanning, changing parameters)
    // 3. Restart from appropriate point
    // 4. Monitor for repeated failures
    
    // For now, we just log the recovery attempt
    this.reporter?.log(`   Recovery strategy: Reset and retry from last stable state`);
  }

  private updateSagaProgress(execution: SagaExecution): void {
    const totalSteps = execution.completedSteps.length + execution.failedSteps.length;
    const successRate = totalSteps > 0 ? (execution.completedSteps.length / totalSteps * 100).toFixed(1) : '0';
    
    this.reporter?.log(`📈 Saga progress update: ${execution.sagaId}`);
    this.reporter?.log(`   Success Rate: ${successRate}% (${execution.completedSteps.length}/${totalSteps})`);
  }

  private async evaluateSagaContinuation(execution: SagaExecution): Promise<void> {
    const totalSteps = execution.completedSteps.length + execution.failedSteps.length;
    const failureRate = totalSteps > 0 ? execution.failedSteps.length / totalSteps : 0;
    
    // If failure rate is too high, trigger compensation
    if (failureRate > 0.5 && totalSteps >= 3) {
      this.reporter?.log(`🚨 High failure rate detected in saga: ${execution.sagaId} (${(failureRate * 100).toFixed(1)}%)`);
      
      if (this.policy.enableCompensation) {
        await this.startCompensation(execution);
      } else {
        await this.terminateSaga(execution);
      }
    }
  }

  private async terminateSaga(execution: SagaExecution): Promise<void> {
    this.clearTimeout(execution.workflowId);
    this.activeExecutions.delete(execution.workflowId);
    
    const duration = new Date().getTime() - execution.startedAt.getTime();
    
    this.reporter?.log(`🔚 Saga terminated: ${execution.sagaId}`);
    this.reporter?.log(`📊 Final saga statistics:`);
    this.reporter?.log(`   Duration: ${Math.round(duration / 1000)}s`);
    this.reporter?.log(`   Completed Steps: ${execution.completedSteps.length}`);
    this.reporter?.log(`   Failed Steps: ${execution.failedSteps.length}`);
    this.reporter?.log(`   Retry Count: ${execution.retryCount}`);
    this.reporter?.log(`   Compensated: ${execution.isCompensating}`);
    this.reporter?.log(`   Final Status: ${execution.isComplete ? 'Completed' : 'Failed'}`);
  }

  /**
   * Get all active saga executions
   */
  getActiveSagas(): SagaExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get saga execution for a specific workflow
   */
  getSagaForWorkflow(workflowId: string): SagaExecution | undefined {
    return this.activeExecutions.get(workflowId);
  }

  /**
   * Get saga statistics
   */
  getSagaStatistics(): {
    activeSagas: number;
    pendingTimeouts: number;
    averageExecutionTime: number;
    totalCompensations: number;
    totalRecoveryAttempts: number;
  } {
    const activeSagas = this.activeExecutions.size;
    const pendingTimeouts = this.timeoutHandles.size;
    
    // Calculate averages from active executions
    const now = new Date().getTime();
    const executions = Array.from(this.activeExecutions.values());
    const totalExecutionTime = executions.reduce((sum, exec) => 
      sum + (now - exec.startedAt.getTime()), 0);
    const averageExecutionTime = executions.length > 0 ? totalExecutionTime / executions.length : 0;
    
    const totalCompensations = executions.filter(e => e.isCompensating).length;
    const totalRetryAttempts = executions.reduce((sum, e) => sum + e.retryCount, 0);
    
    return {
      activeSagas,
      pendingTimeouts,
      averageExecutionTime,
      totalCompensations,
      totalRecoveryAttempts: totalRetryAttempts
    };
  }

  /**
   * Update saga policy
   */
  updatePolicy(newPolicy: Partial<SagaPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
    this.reporter?.log('🔧 Saga policy updated');
  }

  /**
   * Force terminate a specific saga (emergency use)
   */
  async forceTerminate(workflowId: string): Promise<boolean> {
    const execution = this.activeExecutions.get(workflowId);
    if (execution) {
      this.reporter?.log(`🚨 Force terminating saga: ${execution.sagaId}`);
      await this.terminateSaga(execution);
      return true;
    }
    return false;
  }

  /**
   * Cleanup all sagas (for shutdown)
   */
  async cleanup(): Promise<void> {
    this.reporter?.log('🧹 Cleaning up all sagas');
    
    // Clear all timeouts
    for (const timeoutHandle of this.timeoutHandles.values()) {
      clearTimeout(timeoutHandle);
    }
    this.timeoutHandles.clear();
    
    // Terminate all active executions
    const activeWorkflows = Array.from(this.activeExecutions.keys());
    for (const workflowId of activeWorkflows) {
      await this.forceTerminate(workflowId);
    }
    
    this.activeExecutions.clear();
  }
}