import { EventEmitter } from 'events';
import { Task } from '../entities/task';

export class TaskQueue extends EventEmitter {
  private queue: Task[] = [];
  private priorityQueue: Task[] = [];
  private dependencyMap: Map<string, Set<string>> = new Map();
  private completedTasks: Set<string> = new Set();

  constructor() {
    super();
  }

  enqueue(task: Task): void {
    this.queue.push(task);
    
    // Emit event for monitoring
    this.emit('task:enqueued', { 
      task, 
      queueSize: this.size(),
      readyCount: this.size(),
      blockedCount: 0 
    });
  }

  enqueuePriority(task: Task): void {
    this.priorityQueue.push(task);
    
    // Emit event for monitoring
    this.emit('task:enqueued', { 
      task, 
      queueSize: this.size(),
      readyCount: this.size(),
      blockedCount: 0 
    });
  }

  dequeue(): Task | undefined {
    const task = this.queue.shift();
    if (task) {
      // Emit event for monitoring  
      this.emit('task:dequeued', { task, remainingSize: this.size() });
    }
    return task;
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

  isEmpty(): boolean {
    return this.queue.length === 0 && this.priorityQueue.length === 0;
  }

  size(): number {
    return this.queue.length + this.priorityQueue.length;
  }

  // Enhanced error handling and monitoring
  markFailed(taskId: string, error: string): void {
    // Emit event for monitoring
    this.emit('task:failed', { taskId, error, timestamp: new Date() });
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

  getAllTasks(): Task[] {
    return [...this.priorityQueue, ...this.queue];
  }
}