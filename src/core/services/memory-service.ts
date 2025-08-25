import { EventBusInterface } from '../interfaces/event-bus.interface';

export interface MemoryEntry {
  id: string;
  timestamp: Date;
  context: string;           // What situation triggered this learning
  learning: string;          // What was learned
  actionToAvoid?: string;    // What action failed
  alternativeAction?: string; // What to try instead
  confidence: number;        // How confident we are in this learning
}

export interface MemoryContext {
  url: string;
  taskGoal: string;
  pageSection?: string;
}

export class MemoryService {
  private memories: Map<string, MemoryEntry[]> = new Map();
  private recentLearnings: MemoryEntry[] = [];
  private maxRecentMemories = 20;

  constructor(private eventBus?: EventBusInterface) {}

  /**
   * Add a new learning to memory
   */
  addLearning(
    context: MemoryContext,
    learning: string,
    details?: {
      actionToAvoid?: string;
      alternativeAction?: string;
      confidence?: number;
    }
  ): void {
    const entry: MemoryEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      context: this.serializeContext(context),
      learning,
      ...(details?.actionToAvoid && { actionToAvoid: details.actionToAvoid }),
      ...(details?.alternativeAction && { alternativeAction: details.alternativeAction }),
      confidence: details?.confidence || 0.7
    };

    // Store by context key
    const contextKey = this.getContextKey(context);
    if (!this.memories.has(contextKey)) {
      this.memories.set(contextKey, []);
    }
    this.memories.get(contextKey)!.push(entry);

    // Add to recent learnings
    this.recentLearnings.unshift(entry);
    if (this.recentLearnings.length > this.maxRecentMemories) {
      this.recentLearnings.pop();
    }

    // Emit event for monitoring
    this.eventBus?.emit('memory:learning-added', entry);
  }

  /**
   * Get relevant memories for a given context
   */
  getRelevantMemories(context: MemoryContext): MemoryEntry[] {
    const contextKey = this.getContextKey(context);
    const exactMatches = this.memories.get(contextKey) || [];
    
    // Also get similar context memories
    const similarMemories: MemoryEntry[] = [];
    for (const [key, memories] of this.memories.entries()) {
      if (this.isSimilarContext(key, contextKey) && key !== contextKey) {
        similarMemories.push(...memories.slice(-3)); // Last 3 from similar contexts
      }
    }

    // Combine and sort by relevance and recency
    return [...exactMatches, ...similarMemories]
      .sort((a, b) => {
        // Prioritize exact matches and recent memories
        const aScore = (exactMatches.includes(a) ? 1000 : 0) + 
                      (a.confidence * 100) - 
                      (Date.now() - a.timestamp.getTime()) / 100000;
        const bScore = (exactMatches.includes(b) ? 1000 : 0) + 
                      (b.confidence * 100) - 
                      (Date.now() - b.timestamp.getTime()) / 100000;
        return bScore - aScore;
      })
      .slice(0, 10); // Return top 10 most relevant
  }

  /**
   * Get formatted memory string for LLM context
   */
  getMemoryPrompt(context: MemoryContext): string {
    const relevantMemories = this.getRelevantMemories(context);
    
    if (relevantMemories.length === 0) {
      return 'No previous learnings for this context.';
    }

    const learnings = relevantMemories.map(memory => {
      let learning = `- ${memory.learning}`;
      if (memory.actionToAvoid) {
        learning += ` (AVOID: ${memory.actionToAvoid})`;
      }
      if (memory.alternativeAction) {
        learning += ` (TRY INSTEAD: ${memory.alternativeAction})`;
      }
      return learning;
    }).join('\n');

    return `MEMORY LEARNINGS FROM SIMILAR SITUATIONS:\n${learnings}`;
  }

  /**
   * Learn from a failed action
   */
  learnFromFailure(
    context: MemoryContext,
    failedAction: string,
    failureReason: string,
    suggestion?: string
  ): void {
    const learning = `Action "${failedAction}" failed: ${failureReason}`;
    const details: { actionToAvoid: string; alternativeAction?: string; confidence: number } = {
      actionToAvoid: failedAction,
      confidence: 0.9
    };
    if (suggestion) {
      details.alternativeAction = suggestion;
    }
    this.addLearning(context, learning, details);
  }

  /**
   * Learn from a successful pattern
   */
  learnFromSuccess(
    context: MemoryContext,
    successfulAction: string,
    outcome: string
  ): void {
    const learning = `Action "${successfulAction}" succeeded: ${outcome}`;
    this.addLearning(context, learning, {
      confidence: 0.8
    });
  }

  /**
   * Clear memories older than specified days
   */
  pruneOldMemories(daysToKeep: number = 7): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    for (const [key, memories] of this.memories.entries()) {
      const filtered = memories.filter(m => m.timestamp > cutoffDate);
      if (filtered.length === 0) {
        this.memories.delete(key);
      } else {
        this.memories.set(key, filtered);
      }
    }

    this.recentLearnings = this.recentLearnings.filter(m => m.timestamp > cutoffDate);
  }

  private getContextKey(context: MemoryContext): string {
    const urlPart = new URL(context.url).hostname;
    const goalPart = context.taskGoal.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 50);
    const sectionPart = context.pageSection?.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'general';
    return `${urlPart}:${goalPart}:${sectionPart}`;
  }

  private isSimilarContext(key1: string, key2: string): boolean {
    const parts1 = key1.split(':');
    const parts2 = key2.split(':');
    
    // Same domain and similar goal
    return parts1[0] === parts2[0] && 
           (parts1[1] === parts2[1] || this.similarityScore(parts1[1], parts2[1]) > 0.7);
  }

  private similarityScore(str1: string, str2: string): number {
    const words1 = new Set(str1.split('_'));
    const words2 = new Set(str2.split('_'));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }

  private serializeContext(context: MemoryContext): string {
    return `${context.url} | Goal: ${context.taskGoal}${context.pageSection ? ` | Section: ${context.pageSection}` : ''}`;
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export memories for persistence
   */
  exportMemories(): string {
    const data = {
      memories: Array.from(this.memories.entries()),
      recentLearnings: this.recentLearnings,
      exportDate: new Date()
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import memories from persistence
   */
  importMemories(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.memories = new Map(parsed.memories);
      this.recentLearnings = parsed.recentLearnings.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp)
      }));
    } catch (error) {
      console.error('Failed to import memories:', error);
    }
  }
}