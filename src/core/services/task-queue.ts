import { EventEmitter } from 'events';
import { StrategicTask } from '../types/agent-types';

export class TaskQueue extends EventEmitter {
  private queue: StrategicTask[] = [];
  private priorityQueue: StrategicTask[] = [];
  private dependencyMap: Map<string, Set<string>> = new Map();
  private completedTasks: Set<string> = new Set();

  constructor() {
    super();
  }

  enqueue(task: StrategicTask): void {
    this.queue.push(task);
    this.updateDependencyMap(task);
    this.sort();
    
    // Emit event for monitoring
    this.emit('task:enqueued', { 
      task, 
      queueSize: this.size(),
      readyCount: this.getReadyTasks().length,
      blockedCount: this.getBlockedTasks().length 
    });
  }

  enqueuePriority(task: StrategicTask): void {
    this.priorityQueue.push(task);
    this.updateDependencyMap(task);
    
    // Emit event for monitoring
    this.emit('task:enqueued', { 
      task, 
      queueSize: this.size(),
      readyCount: this.getReadyTasks().length,
      blockedCount: this.getBlockedTasks().length 
    });
  }

  dequeue(): StrategicTask | null {
    const task = this.findAndRemoveReadyTask();
    if (task) {
      // Emit event for monitoring  
      this.emit('task:dequeued', { task, remainingSize: this.size() });
    }
    return task;
  }

  private findAndRemoveReadyTask(): StrategicTask | null {
    // Check priority queue first
    for (let i = 0; i < this.priorityQueue.length; i++) {
      const task = this.priorityQueue[i];
      if (this.areDependenciesMet(task)) {
        this.priorityQueue.splice(i, 1);
        return task;
      }
    }

    // Check regular queue
    for (let i = 0; i < this.queue.length; i++) {
      const task = this.queue[i];
      if (this.areDependenciesMet(task)) {
        this.queue.splice(i, 1);
        return task;
      }
    }

    return null;
  }

  markCompleted(taskId: string): void {
    this.completedTasks.add(taskId);
    
    // Emit task:completed event for monitoring
    this.emit('task:completed', { 
      taskId, 
      completedCount: this.completedTasks.size,
      timestamp: new Date()
    });
  }

  areDependenciesMet(task: StrategicTask): boolean {
    for (const depId of task.dependencies) {
      if (!this.completedTasks.has(depId)) {
        return false;
      }
    }
    return true;
  }

  private updateDependencyMap(task: StrategicTask): void {
    this.dependencyMap.set(task.id, new Set(task.dependencies));
  }

  private sort(): void {
    this.queue.sort((a, b) => {
      // Sort by priority (higher first)
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      
      // Then by number of dependencies (fewer first)
      return a.dependencies.length - b.dependencies.length;
    });
  }

  isEmpty(): boolean {
    return this.queue.length === 0 && this.priorityQueue.length === 0;
  }

  size(): number {
    return this.queue.length + this.priorityQueue.length;
  }

  getReadyTasks(): StrategicTask[] {
    const readyTasks = [];
    
    // Check priority queue
    for (const task of this.priorityQueue) {
      if (this.areDependenciesMet(task)) {
        readyTasks.push(task);
      }
    }
    
    // Check regular queue
    for (const task of this.queue) {
      if (this.areDependenciesMet(task)) {
        readyTasks.push(task);
      }
    }
    
    return readyTasks;
  }

  getBlockedTasks(): StrategicTask[] {
    const blockedTasks = [];
    
    // Check priority queue
    for (const task of this.priorityQueue) {
      if (!this.areDependenciesMet(task)) {
        blockedTasks.push(task);
      }
    }
    
    // Check regular queue
    for (const task of this.queue) {
      if (!this.areDependenciesMet(task)) {
        blockedTasks.push(task);
      }
    }
    
    return blockedTasks;
  }

  // Enhanced dependency analysis
  getUnmetDependencies(task: StrategicTask): string[] {
    return task.dependencies.filter(depId => !this.completedTasks.has(depId));
  }
  
  // Performance optimization for high-priority tasks
  optimizeForHighPriority(): void {
    if (this.size() > 10) {
      this.priorityQueue.sort((a, b) => b.priority - a.priority);
      
      this.emit('queue:optimized', { 
        queueSize: this.size(),
        priorityTasks: this.priorityQueue.length
      });
    }
  }
  
  // Enhanced error handling and monitoring
  markFailed(taskId: string, error: string): void {
    // Emit event for monitoring
    this.emit('task:failed', { taskId, error, timestamp: new Date() });
  }

  markBlocked(task: StrategicTask): void {
    const unmetDeps = this.getUnmetDependencies(task);
    
    // Emit event for monitoring
    this.emit('task:blocked', { 
      task, 
      dependencies: task.dependencies,
      unmetDependencies: unmetDeps,
      blockedCount: this.getBlockedTasks().length
    });
  }
  
  // Memory management for large task graphs
  cleanupCompletedTasks(): void {
    // Keep only last 100 completed tasks to prevent memory growth
    if (this.completedTasks.size > 100) {
      const tasksArray = Array.from(this.completedTasks);
      const toRemove = tasksArray.slice(0, tasksArray.length - 100);
      toRemove.forEach(taskId => this.completedTasks.delete(taskId));
      
      this.emit('queue:cleanup', { 
        removedCount: toRemove.length, 
        remainingCount: this.completedTasks.size 
      });
    }
  }

  clear(): void {
    this.queue = [];
    this.priorityQueue = [];
    this.dependencyMap.clear();
    this.completedTasks.clear();
  }

  getAllTasks(): StrategicTask[] {
    return [...this.priorityQueue, ...this.queue];
  }
}