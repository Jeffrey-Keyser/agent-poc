import { StrategicTask } from '../types/agent-types';

export class TaskQueue {
  private queue: StrategicTask[] = [];
  private priorityQueue: StrategicTask[] = [];
  private dependencyMap: Map<string, Set<string>> = new Map();
  private completedTasks: Set<string> = new Set();

  enqueue(task: StrategicTask): void {
    this.queue.push(task);
    this.updateDependencyMap(task);
    this.sort();
  }

  enqueuePriority(task: StrategicTask): void {
    this.priorityQueue.push(task);
    this.updateDependencyMap(task);
  }

  dequeue(): StrategicTask | null {
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