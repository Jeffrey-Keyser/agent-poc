/**
 * Workflow Stuck Handler
 * 
 * This handler detects workflows that have become stuck or stalled and implements
 * recovery strategies such as replanning, alternative approaches, or escalation.
 */

import { 
  BaseEventHandler, 
  DomainEvent,
  WorkflowStartedEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  EventTypes
} from '../../core/domain-events';
import { AgentReporter } from '../../core/interfaces/agent-reporter.interface';

export interface WorkflowHealthMetrics {
  workflowId: string;
  startedAt: Date;
  lastActivityAt: Date;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  currentTaskStartedAt?: Date;
  isStuck: boolean;
  stuckDetectedAt?: Date;
  recoveryAttempts: number;
}

export interface StuckDetectionPolicy {
  maxInactivityMs: number;      // Max time without any activity
  maxTaskDurationMs: number;    // Max time for a single task
  maxFailureRate: number;       // Max failure rate (0.0 - 1.0)
  minTasksForAnalysis: number;  // Min tasks before analyzing failure rate
}

/**
 * Event handler that detects and recovers stuck workflows
 */
export class WorkflowStuckHandler extends BaseEventHandler {
  protected eventTypes = [
    EventTypes.WORKFLOW_STARTED,
    EventTypes.TASK_STARTED,
    EventTypes.TASK_COMPLETED,
    EventTypes.TASK_FAILED
  ];

  private workflowRegistry = new Map<string, WorkflowHealthMetrics>();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private policy: StuckDetectionPolicy;

  constructor(
    private reporter?: AgentReporter,
    policy: StuckDetectionPolicy = {
      maxInactivityMs: 5 * 60 * 1000,
      maxTaskDurationMs: 2 * 60 * 1000,
      maxFailureRate: 0.8,
      minTasksForAnalysis: 3
    },
    private healthCheckIntervalMs: number = 30000 // Check every 30 seconds
  ) {
    super();
    this.policy = policy;
    this.startHealthMonitoring();
  }

  async handle(event: DomainEvent): Promise<void> {
    switch (event.eventType) {
      case EventTypes.WORKFLOW_STARTED:
        await this.handleWorkflowStarted(event as WorkflowStartedEvent);
        break;
      case EventTypes.TASK_STARTED:
        await this.handleTaskStarted(event as TaskStartedEvent);
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
    const now = new Date();

    const metrics: WorkflowHealthMetrics = {
      workflowId,
      startedAt: now,
      lastActivityAt: now,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      isStuck: false,
      recoveryAttempts: 0
    };

    this.workflowRegistry.set(workflowId, metrics);
    this.reporter?.log(`📊 Workflow health monitoring started: ${workflowId}`);
  }

  private async handleTaskStarted(event: TaskStartedEvent): Promise<void> {
    const workflowId = (event as any).workflowId?.toString?.() || event.aggregateId;
    const metrics = this.workflowRegistry.get(workflowId);
    
    if (metrics) {
      const now = new Date();
      metrics.lastActivityAt = now;
      metrics.currentTaskStartedAt = now;
      metrics.totalTasks++;
      
      // Clear stuck status if workflow becomes active again
      if (metrics.isStuck) {
        metrics.isStuck = false;
        delete metrics.stuckDetectedAt;
        this.reporter?.log(`✅ Workflow recovered from stuck state: ${workflowId}`);
      }
    }
  }

  private async handleTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    const workflowId = (event as any).workflowId?.toString?.() || event.aggregateId;
    const metrics = this.workflowRegistry.get(workflowId);
    
    if (metrics) {
      const now = new Date();
      metrics.lastActivityAt = now;
      metrics.completedTasks++;
      delete metrics.currentTaskStartedAt;
    }
  }

  private async handleTaskFailed(event: TaskFailedEvent): Promise<void> {
    const workflowId = (event as any).workflowId?.toString?.() || event.aggregateId;
    const metrics = this.workflowRegistry.get(workflowId);
    
    if (metrics) {
      const now = new Date();
      metrics.lastActivityAt = now;
      metrics.failedTasks++;
      delete metrics.currentTaskStartedAt;
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckIntervalMs);
  }

  private performHealthCheck(): void {
    const now = new Date();
    
    for (const metrics of this.workflowRegistry.values()) {
      const isCurrentlyStuck = this.isWorkflowStuck(metrics, now);
      
      if (isCurrentlyStuck && !metrics.isStuck) {
        // Newly detected stuck workflow
        metrics.isStuck = true;
        metrics.stuckDetectedAt = now;
        this.handleStuckWorkflow(metrics);
      } else if (!isCurrentlyStuck && metrics.isStuck) {
        // Workflow recovered
        metrics.isStuck = false;
        delete metrics.stuckDetectedAt;
        this.reporter?.log(`✅ Workflow health restored: ${metrics.workflowId}`);
      }
    }
  }

  private isWorkflowStuck(metrics: WorkflowHealthMetrics, now: Date): boolean {
    // Check for overall inactivity
    const timeSinceLastActivity = now.getTime() - metrics.lastActivityAt.getTime();
    if (timeSinceLastActivity > this.policy.maxInactivityMs) {
      return true;
    }

    // Check for long-running tasks
    if (metrics.currentTaskStartedAt) {
      const taskDuration = now.getTime() - metrics.currentTaskStartedAt.getTime();
      if (taskDuration > this.policy.maxTaskDurationMs) {
        return true;
      }
    }

    // Check failure rate (only if we have enough data)
    if (metrics.totalTasks >= this.policy.minTasksForAnalysis) {
      const failureRate = metrics.failedTasks / metrics.totalTasks;
      if (failureRate > this.policy.maxFailureRate) {
        return true;
      }
    }

    return false;
  }

  private handleStuckWorkflow(metrics: WorkflowHealthMetrics): void {
    this.reporter?.log(`🚨 Stuck workflow detected: ${metrics.workflowId}`);
    this.reporter?.log(`📊 Health metrics:`);
    this.reporter?.log(`   Started: ${metrics.startedAt.toISOString()}`);
    this.reporter?.log(`   Last Activity: ${metrics.lastActivityAt.toISOString()}`);
    this.reporter?.log(`   Total Tasks: ${metrics.totalTasks}`);
    this.reporter?.log(`   Completed: ${metrics.completedTasks}`);
    this.reporter?.log(`   Failed: ${metrics.failedTasks}`);
    
    if (metrics.totalTasks > 0) {
      const successRate = (metrics.completedTasks / metrics.totalTasks * 100).toFixed(1);
      const failureRate = (metrics.failedTasks / metrics.totalTasks * 100).toFixed(1);
      this.reporter?.log(`   Success Rate: ${successRate}%`);
      this.reporter?.log(`   Failure Rate: ${failureRate}%`);
    }

    // Determine recovery strategy
    this.planRecoveryStrategy(metrics);
  }

  private planRecoveryStrategy(metrics: WorkflowHealthMetrics): void {
    const recoveryLevel = this.determineRecoveryLevel(metrics);
    
    switch (recoveryLevel) {
      case 'replan':
        this.triggerReplanning(metrics);
        break;
      case 'alternative_approach':
        this.suggestAlternativeApproach(metrics);
        break;
      case 'human_intervention':
        this.escalateToHuman(metrics);
        break;
      case 'abort':
        this.recommendAbortion(metrics);
        break;
    }
  }

  private determineRecoveryLevel(metrics: WorkflowHealthMetrics): 'replan' | 'alternative_approach' | 'human_intervention' | 'abort' {
    // Base decision on recovery attempts and failure patterns
    if (metrics.recoveryAttempts === 0) {
      return 'replan';
    } else if (metrics.recoveryAttempts === 1) {
      return 'alternative_approach';
    } else if (metrics.recoveryAttempts === 2) {
      return 'human_intervention';
    } else {
      return 'abort';
    }
  }

  private triggerReplanning(metrics: WorkflowHealthMetrics): void {
    metrics.recoveryAttempts++;
    this.reporter?.log(`🔄 Recovery Strategy: Replanning workflow ${metrics.workflowId}`);
    
    // TODO: In real implementation, this would trigger workflow replanning
    // Example integration:
    // await this.workflowManager.replanWorkflow(metrics.workflowId);
  }

  private suggestAlternativeApproach(metrics: WorkflowHealthMetrics): void {
    metrics.recoveryAttempts++;
    this.reporter?.log(`🔀 Recovery Strategy: Alternative approach for workflow ${metrics.workflowId}`);
    
    // TODO: In real implementation, this could:
    // 1. Switch to different execution strategies
    // 2. Use alternative AI models
    // 3. Change browser settings or user agent
    // 4. Try different selectors or interaction methods
  }

  private escalateToHuman(metrics: WorkflowHealthMetrics): void {
    metrics.recoveryAttempts++;
    this.reporter?.log(`👥 Recovery Strategy: Human intervention requested for workflow ${metrics.workflowId}`);
    
    // TODO: In real implementation, this could:
    // 1. Send notification to support team
    // 2. Create a support ticket with context
    // 3. Save workflow state for human review
    // 4. Provide debugging information
  }

  private recommendAbortion(metrics: WorkflowHealthMetrics): void {
    metrics.recoveryAttempts++;
    this.reporter?.log(`❌ Recovery Strategy: Recommending abortion of workflow ${metrics.workflowId}`);
    
    // TODO: In real implementation, this could:
    // 1. Safely terminate the workflow
    // 2. Clean up resources
    // 3. Generate failure report
    // 4. Notify stakeholders
  }

  /**
   * Get health metrics for a specific workflow
   */
  getWorkflowHealth(workflowId: string): WorkflowHealthMetrics | undefined {
    return this.workflowRegistry.get(workflowId);
  }

  /**
   * Get all workflow health metrics
   */
  getAllWorkflowHealth(): WorkflowHealthMetrics[] {
    return Array.from(this.workflowRegistry.values());
  }

  /**
   * Remove workflow from monitoring (when workflow completes or is terminated)
   */
  stopMonitoring(workflowId: string): void {
    this.workflowRegistry.delete(workflowId);
    this.reporter?.log(`📊 Stopped health monitoring for workflow: ${workflowId}`);
  }

  /**
   * Update detection policy
   */
  updatePolicy(newPolicy: Partial<StuckDetectionPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
    this.reporter?.log('📊 Updated stuck detection policy');
  }

  /**
   * Get overall health statistics
   */
  getHealthStatistics(): {
    totalWorkflows: number;
    activeWorkflows: number;
    stuckWorkflows: number;
    workflowsWithHighFailureRate: number;
    averageTasksPerWorkflow: number;
    averageSuccessRate: number;
  } {
    const allMetrics = this.getAllWorkflowHealth();
    const stuckCount = allMetrics.filter(m => m.isStuck).length;
    const highFailureRate = allMetrics.filter(m => {
      if (m.totalTasks < this.policy.minTasksForAnalysis) return false;
      return (m.failedTasks / m.totalTasks) > this.policy.maxFailureRate;
    }).length;

    const totalTasks = allMetrics.reduce((sum, m) => sum + m.totalTasks, 0);
    const totalCompleted = allMetrics.reduce((sum, m) => sum + m.completedTasks, 0);
    
    return {
      totalWorkflows: allMetrics.length,
      activeWorkflows: allMetrics.filter(m => !m.isStuck).length,
      stuckWorkflows: stuckCount,
      workflowsWithHighFailureRate: highFailureRate,
      averageTasksPerWorkflow: allMetrics.length > 0 ? totalTasks / allMetrics.length : 0,
      averageSuccessRate: totalTasks > 0 ? (totalCompleted / totalTasks) * 100 : 0
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.workflowRegistry.clear();
  }
}