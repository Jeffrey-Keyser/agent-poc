import { EventBusInterface } from '../interfaces/event-bus.interface';
import { MemoryRepository, LearnedPattern, PatternContext } from '../repositories';

export interface MemoryEntry {
  id: string;
  timestamp: Date;
  context: string;
  learning: string;
  actionToAvoid?: string;
  alternativeAction?: string;
  confidence: number;
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

  constructor(
    private eventBus?: EventBusInterface,
    private memoryRepository?: MemoryRepository
  ) {}

  /**
   * Add a new learning to memory
   */
  async addLearning(
    context: MemoryContext,
    learning: string,
    details?: {
      actionToAvoid?: string;
      alternativeAction?: string;
      confidence?: number;
    }
  ): Promise<void> {
    const entry: MemoryEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      context: this.serializeContext(context),
      learning,
      ...(details?.actionToAvoid && { actionToAvoid: details.actionToAvoid }),
      ...(details?.alternativeAction && { alternativeAction: details.alternativeAction }),
      confidence: details?.confidence || 0.7
    };

    if (this.memoryRepository) {
      try {
        const learnedPattern: LearnedPattern = {
          id: entry.id,
          context: entry.context,
          pattern: learning,
          successRate: (details?.confidence || 0.7) * 100,
          usageCount: 1,
          createdAt: entry.timestamp,
          lastUsedAt: entry.timestamp,
          tags: this.extractTagsFromContext(context),
          metadata: {
            actionToAvoid: details?.actionToAvoid,
            alternativeAction: details?.alternativeAction,
            taskGoal: context.taskGoal,
            url: context.url,
            pageSection: context.pageSection
          }
        };
        
        await this.memoryRepository.savePattern(learnedPattern);
      } catch (error) {
        console.error('Failed to save pattern to repository:', error);
        // Fallback to legacy storage
        this.addToLegacyStorage(entry, context);
      }
    } else {
      // Use legacy storage
      this.addToLegacyStorage(entry, context);
    }

    // Emit event for monitoring
    this.eventBus?.emit('memory:learning-added', entry);
  }
  
  private addToLegacyStorage(entry: MemoryEntry, context: MemoryContext): void {
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
  }

  private extractTagsFromContext(context: MemoryContext): string[] {
    const tags: string[] = [];
    
    // Extract domain from URL
    try {
      const url = new URL(context.url);
      tags.push(url.hostname);
    } catch (e) {
      // Ignore invalid URLs
    }
    
    // Add task-based tags
    tags.push('task');
    if (context.pageSection) {
      tags.push(context.pageSection);
    }
    
    // Extract simple keywords from task goal
    const goalWords = context.taskGoal.toLowerCase().split(/\s+/).filter(word => 
      word.length > 3 && !['this', 'that', 'with', 'from', 'they', 'have', 'will'].includes(word)
    );
    tags.push(...goalWords.slice(0, 3)); // Take first 3 meaningful words
    
    return tags;
  }

  /**
   * Get relevant memories for a given context
   */
  async getRelevantMemories(context: MemoryContext): Promise<MemoryEntry[]> {
    if (this.memoryRepository) {
      try {
        const domain = this.extractDomainFromUrl(context.url);
        const patternContext: PatternContext = {
          goal: context.taskGoal,
          ...(domain && { domain }),
          taskTypes: this.extractTaskTypes(context)
        };
        
        const patterns = await this.memoryRepository.findByContext(patternContext, 10);
        
        // Convert learned patterns back to memory entries for backward compatibility
        return patterns.map(pattern => ({
          id: pattern.id,
          timestamp: pattern.lastUsedAt,
          context: pattern.context,
          learning: pattern.pattern,
          actionToAvoid: pattern.metadata?.actionToAvoid,
          alternativeAction: pattern.metadata?.alternativeAction,
          confidence: pattern.successRate / 100
        }));
      } catch (error) {
        console.error('Failed to get patterns from repository:', error);
        // Fallback to legacy storage
      }
    }

    // Legacy implementation
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

  private extractDomainFromUrl(url: string): string | undefined {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return undefined;
    }
  }

  private extractTaskTypes(context: MemoryContext): string[] {
    const taskTypes: string[] = [];
    
    const goal = context.taskGoal.toLowerCase();
    
    // Simple task type detection
    if (goal.includes('search') || goal.includes('find')) {
      taskTypes.push('search');
    }
    if (goal.includes('buy') || goal.includes('purchase') || goal.includes('order')) {
      taskTypes.push('purchase');
    }
    if (goal.includes('login') || goal.includes('sign in')) {
      taskTypes.push('authentication');
    }
    if (goal.includes('click') || goal.includes('button')) {
      taskTypes.push('interaction');
    }
    if (goal.includes('form') || goal.includes('submit')) {
      taskTypes.push('form-submission');
    }
    
    // Default task type
    if (taskTypes.length === 0) {
      taskTypes.push('general');
    }
    
    return taskTypes;
  }

  /**
   * Get formatted memory string for LLM context
   */
  async getMemoryPrompt(context: MemoryContext): Promise<string> {
    const relevantMemories = await this.getRelevantMemories(context);
    
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
  async learnFromFailure(
    context: MemoryContext,
    failedAction: string,
    failureReason: string,
    suggestion?: string
  ): Promise<void> {
    const learning = `Action "${failedAction}" failed: ${failureReason}`;
    const details: { actionToAvoid: string; alternativeAction?: string; confidence: number } = {
      actionToAvoid: failedAction,
      confidence: 0.9
    };
    if (suggestion) {
      details.alternativeAction = suggestion;
    }
    await this.addLearning(context, learning, details);
  }

  /**
   * Learn from a successful pattern
   */
  async learnFromSuccess(
    context: MemoryContext,
    successfulAction: string,
    outcome: string
  ): Promise<void> {
    const learning = `Action "${successfulAction}" succeeded: ${outcome}`;
    await this.addLearning(context, learning, {
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