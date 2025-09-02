/**
 * Task Failure Handler
 * 
 * This handler responds to task failure events by implementing automatic retry logic,
 * escalation procedures, and failure recovery strategies.
 */

import { 
  BaseEventHandler, 
  DomainEvent,
  TaskFailedEvent,
  EventTypes
} from '../../core/domain-events';
import { AgentReporter } from '../../core/interfaces/agent-reporter.interface';

export interface FailureRetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  exponentialBackoff: boolean;
  jitterEnabled: boolean;
}

export interface TaskFailureMetrics {
  taskId: string;
  failureCount: number;
  lastFailureAt: Date;
  firstFailureAt: Date;
  retryScheduledAt?: Date;
  escalated: boolean;
}

/**
 * Event handler that manages task failure recovery and retry logic
 */
export class TaskFailureHandler extends BaseEventHandler {
  protected eventTypes = [
    EventTypes.TASK_FAILED
  ];

  private failureRegistry = new Map<string, TaskFailureMetrics>();
  private retryTimeouts = new Map<string, NodeJS.Timeout>();
  private retryPolicy: FailureRetryPolicy;

  constructor(
    private reporter?: AgentReporter,
    retryPolicy: FailureRetryPolicy = {
      maxRetries: 3,
      baseDelayMs: 1000,
      exponentialBackoff: true,
      jitterEnabled: true
    }
  ) {
    super();
    this.retryPolicy = retryPolicy;
  }

  async handle(event: DomainEvent): Promise<void> {
    if (event.eventType === EventTypes.TASK_FAILED) {
      await this.handleTaskFailed(event as TaskFailedEvent);
    }
  }

  private async handleTaskFailed(event: TaskFailedEvent): Promise<void> {
    const taskId = event.aggregateId;
    const now = new Date();

    // Get or create failure metrics for this task
    let metrics = this.failureRegistry.get(taskId);
    if (!metrics) {
      metrics = {
        taskId,
        failureCount: 0,
        lastFailureAt: now,
        firstFailureAt: now,
        escalated: false
      };
      this.failureRegistry.set(taskId, metrics);
    }

    // Update failure metrics
    metrics.failureCount++;
    metrics.lastFailureAt = now;

    this.reporter?.log(`❌ Task failure recorded: ${taskId} (count: ${metrics.failureCount})`);

    // Determine if retry is possible
    const shouldRetry = this.shouldRetryTask(metrics);
    
    if (shouldRetry) {
      await this.scheduleRetry(taskId, metrics);
    } else {
      await this.escalateFailure(taskId, metrics, event);
    }
  }

  private shouldRetryTask(metrics: TaskFailureMetrics): boolean {
    return (
      metrics.failureCount <= this.retryPolicy.maxRetries &&
      !metrics.escalated
    );
  }

  private async scheduleRetry(taskId: string, metrics: TaskFailureMetrics): Promise<void> {
    // Calculate retry delay
    let delay = this.calculateRetryDelay(metrics.failureCount);
    
    // Add jitter if enabled
    if (this.retryPolicy.jitterEnabled) {
      const jitter = Math.random() * (delay * 0.1);
      delay += jitter;
    }

    metrics.retryScheduledAt = new Date(Date.now() + delay);

    this.reporter?.log(`🔄 Retry scheduled for task ${taskId} in ${Math.round(delay)}ms (attempt ${metrics.failureCount + 1})`);

    // Clear any existing timeout for this task
    const existingTimeout = this.retryTimeouts.get(taskId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule the retry
    const timeout = setTimeout(async () => {
      await this.executeRetry(taskId, metrics);
      this.retryTimeouts.delete(taskId);
    }, delay);

    this.retryTimeouts.set(taskId, timeout);
  }

  private calculateRetryDelay(attemptNumber: number): number {
    if (this.retryPolicy.exponentialBackoff) {
      return this.retryPolicy.baseDelayMs * Math.pow(2, attemptNumber - 1);
    } else {
      return this.retryPolicy.baseDelayMs;
    }
  }

  private async executeRetry(taskId: string, metrics: TaskFailureMetrics): Promise<void> {
    this.reporter?.log(`🔄 Executing retry for task ${taskId} (attempt ${metrics.failureCount + 1})`);
    
    // TODO: In a real implementation, this would trigger the task execution
    // For now, we just log the retry attempt
    // This would integrate with the WorkflowManager to re-execute the task
    
    // Example integration point:
    // await this.workflowManager.retryTask(taskId);
  }

  private async escalateFailure(taskId: string, metrics: TaskFailureMetrics, event: TaskFailedEvent): Promise<void> {
    metrics.escalated = true;
    
    this.reporter?.log(`🚨 Task failure escalated: ${taskId} - exceeded retry limit (${metrics.failureCount} failures)`);
    
    // Log detailed failure information
    const failureDuration = metrics.lastFailureAt.getTime() - metrics.firstFailureAt.getTime();
    
    this.reporter?.log(`📊 Failure Analysis:`);
    this.reporter?.log(`   Task ID: ${taskId}`);
    this.reporter?.log(`   Total Failures: ${metrics.failureCount}`);
    this.reporter?.log(`   First Failure: ${metrics.firstFailureAt.toISOString()}`);
    this.reporter?.log(`   Last Failure: ${metrics.lastFailureAt.toISOString()}`);
    this.reporter?.log(`   Failure Duration: ${Math.round(failureDuration / 1000)}s`);
    this.reporter?.log(`   Final Error: ${(event as any).reason || 'Unknown'}`);
    
    // TODO: In a real implementation, this could:
    // 1. Send notification to administrators
    // 2. Create a support ticket
    // 3. Trigger alternative execution strategies
    // 4. Mark the workflow as requiring human intervention
  }

  /**
   * Get failure metrics for a specific task
   */
  getTaskFailureMetrics(taskId: string): TaskFailureMetrics | undefined {
    return this.failureRegistry.get(taskId);
  }

  /**
   * Get all failure metrics
   */
  getAllFailureMetrics(): TaskFailureMetrics[] {
    return Array.from(this.failureRegistry.values());
  }

  /**
   * Clear failure history for a task (useful when task succeeds after retry)
   */
  clearTaskFailures(taskId: string): void {
    this.failureRegistry.delete(taskId);
    
    const timeout = this.retryTimeouts.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.retryTimeouts.delete(taskId);
    }
  }

  /**
   * Update retry policy
   */
  updateRetryPolicy(newPolicy: Partial<FailureRetryPolicy>): void {
    this.retryPolicy = { ...this.retryPolicy, ...newPolicy };
  }

  /**
   * Cancel all pending retries (useful for shutdown)
   */
  cancelAllRetries(): void {
    for (const timeout of this.retryTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.retryTimeouts.clear();
  }

  /**
   * Get retry statistics
   */
  getRetryStatistics(): {
    totalTasks: number;
    tasksWithFailures: number;
    escalatedTasks: number;
    pendingRetries: number;
    averageFailuresPerTask: number;
  } {
    const allMetrics = this.getAllFailureMetrics();
    const escalatedCount = allMetrics.filter(m => m.escalated).length;
    const totalFailures = allMetrics.reduce((sum, m) => sum + m.failureCount, 0);
    
    return {
      totalTasks: allMetrics.length,
      tasksWithFailures: allMetrics.length,
      escalatedTasks: escalatedCount,
      pendingRetries: this.retryTimeouts.size,
      averageFailuresPerTask: allMetrics.length > 0 ? totalFailures / allMetrics.length : 0
    };
  }
}