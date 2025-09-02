
export type AppEvents = {
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
  'queue:task-added': any;
  'queue:task-removed': any;
  'queue:task-completed': any;
  'queue:task-failed': any;
  'queue:task-blocked': any;
  'queue:optimized': any;
  'queue:cleanup': any;
  'state:captured': any;
  'state:checkpoint': any;
  'state:data-extracted': any;
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
