import { Run } from '../entities/run';
import { Task, TaskAction } from '../entities/task';

export type AppEvents = {
  'run:update': Run;
  'task:update': Task;
  'action:update': TaskAction;
  'pristine-screenshot:taken': string;
  // Multi-agent workflow events
  'workflow:started': any;
  'workflow:planning': any;
  'workflow:completed': any;
  'workflow:error': any;
  'step:started': any;
  'step:completed': any;
  'step:failed': any;
  'task:started': any;
  'task:completed': any;
  'task:failed': any;
  'replan:triggered': any;
  // Memory system events
  'memory:learning-added': any;
};

export interface EventBusInterface {
  emit<E extends keyof AppEvents>(event: E, data: AppEvents[E]): void;
  on<E extends keyof AppEvents>(
    event: E,
    callback: (data: AppEvents[E]) => void,
  ): void;
}

// Alias for backward compatibility with multi-agent implementation
export type EnhancedEventBusInterface = EventBusInterface;
