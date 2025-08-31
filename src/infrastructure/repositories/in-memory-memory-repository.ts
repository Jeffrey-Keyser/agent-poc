import { 
  MemoryRepository, 
  LearnedPattern, 
  PatternContext 
} from '../../core/repositories/memory-repository';

/**
 * In-memory implementation of MemoryRepository.
 * Suitable for development, testing, and simple deployments.
 * In production, this would be backed by a persistent store.
 */
export class InMemoryMemoryRepository implements MemoryRepository {
  private patterns: Map<string, LearnedPattern> = new Map();

  async savePattern(pattern: LearnedPattern): Promise<void> {
    if (this.patterns.has(pattern.id)) {
      throw new Error(`Pattern with ID ${pattern.id} already exists.`);
    }
    this.patterns.set(pattern.id, { ...pattern });
  }

  async findSimilarPatterns(context: string, limit: number = 10): Promise<LearnedPattern[]> {
    const results: Array<{ pattern: LearnedPattern; score: number }> = [];
    const searchTerm = context.toLowerCase();
    
    for (const pattern of this.patterns.values()) {
      let score = 0;
      
      // Simple similarity scoring based on context matching
      if (pattern.context.toLowerCase().includes(searchTerm)) {
        score += 10;
      }
      
      // Check pattern content
      if (pattern.pattern.toLowerCase().includes(searchTerm)) {
        score += 5;
      }
      
      // Boost score for successful patterns
      score += pattern.successRate * 3;
      
      // Boost score for frequently used patterns
      score += Math.min(pattern.usageCount * 0.1, 2);
      
      // Penalize old patterns that haven't been used recently
      const daysSinceLastUse = (Date.now() - pattern.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastUse > 30) {
        score *= 0.8;
      }
      
      if (score > 0) {
        results.push({ pattern, score });
      }
    }
    
    // Sort by score (highest first) and apply limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(result => result.pattern);
  }

  async findByContext(context: PatternContext, limit: number = 10): Promise<LearnedPattern[]> {
    const results: Array<{ pattern: LearnedPattern; score: number }> = [];
    
    for (const pattern of this.patterns.values()) {
      let score = 0;
      
      // Match goal
      if (pattern.context.toLowerCase().includes(context.goal.toLowerCase())) {
        score += 15;
      }
      
      // Match domain
      if (context.domain && pattern.context.toLowerCase().includes(context.domain.toLowerCase())) {
        score += 10;
      }
      
      // Match task types
      for (const taskType of context.taskTypes) {
        if (pattern.context.toLowerCase().includes(taskType.toLowerCase())) {
          score += 8;
        }
      }
      
      // Boost for successful patterns
      score += pattern.successRate * 5;
      
      // Consider previous attempts (prefer patterns that worked after failures)
      if (context.previousAttempts !== undefined && context.previousAttempts > 0) {
        if (pattern.metadata?.recoveredFromFailure) {
          score += 5;
        }
      }
      
      if (score > 0) {
        results.push({ pattern, score });
      }
    }
    
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(result => result.pattern);
  }

  async updatePatternSuccess(patternId: string, success: boolean): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern with ID ${patternId} not found.`);
    }
    
    // Update success rate using running average
    const totalAttempts = pattern.usageCount + 1;
    const successfulAttempts = Math.round(pattern.successRate * pattern.usageCount / 100) + (success ? 1 : 0);
    
    const updatedPattern: LearnedPattern = {
      ...pattern,
      successRate: (successfulAttempts / totalAttempts) * 100,
      usageCount: totalAttempts,
      lastUsedAt: new Date()
    };
    
    this.patterns.set(patternId, updatedPattern);
  }

  async findById(id: string): Promise<LearnedPattern | undefined> {
    const pattern = this.patterns.get(id);
    return pattern ? { ...pattern } : undefined;
  }

  async findByTags(tags: string[], matchAll: boolean = false): Promise<LearnedPattern[]> {
    const results: LearnedPattern[] = [];
    
    for (const pattern of this.patterns.values()) {
      const matchingTags = pattern.tags.filter(tag => 
        tags.some(searchTag => searchTag.toLowerCase() === tag.toLowerCase())
      );
      
      const shouldInclude = matchAll 
        ? matchingTags.length === tags.length 
        : matchingTags.length > 0;
      
      if (shouldInclude) {
        results.push(pattern);
      }
    }
    
    // Sort by success rate and usage count
    return results.sort((a, b) => {
      const scoreA = a.successRate + (a.usageCount * 0.1);
      const scoreB = b.successRate + (b.usageCount * 0.1);
      return scoreB - scoreA;
    });
  }

  async findMostSuccessful(context: string, limit: number = 5): Promise<LearnedPattern[]> {
    const similarPatterns = await this.findSimilarPatterns(context, limit * 2);
    
    // Filter for high success rates and sort
    return similarPatterns
      .filter(pattern => pattern.successRate >= 70 && pattern.usageCount >= 2)
      .sort((a, b) => {
        // Primary sort: success rate
        const successDiff = b.successRate - a.successRate;
        if (Math.abs(successDiff) > 5) {
          return successDiff;
        }
        // Secondary sort: usage count
        return b.usageCount - a.usageCount;
      })
      .slice(0, limit);
  }

  async updatePatternMetadata(patternId: string, metadata: Record<string, any>): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern with ID ${patternId} not found.`);
    }
    
    const updatedPattern: LearnedPattern = {
      ...pattern,
      metadata: {
        ...pattern.metadata,
        ...metadata
      }
    };
    
    this.patterns.set(patternId, updatedPattern);
  }

  async delete(id: string): Promise<void> {
    const deleted = this.patterns.delete(id);
    if (!deleted) {
      throw new Error(`Pattern with ID ${id} not found.`);
    }
  }

  async findUnusedPatterns(olderThanDays: number): Promise<LearnedPattern[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const unusedPatterns: LearnedPattern[] = [];
    
    for (const pattern of this.patterns.values()) {
      if (pattern.lastUsedAt < cutoffDate) {
        unusedPatterns.push(pattern);
      }
    }
    
    return unusedPatterns.sort((a, b) => a.lastUsedAt.getTime() - b.lastUsedAt.getTime());
  }

  async count(): Promise<number> {
    return this.patterns.size;
  }

  /**
   * Clear all patterns from the repository.
   * Useful for testing and development.
   */
  async clear(): Promise<void> {
    this.patterns.clear();
  }

  /**
   * Get statistics about the patterns in the repository.
   * Useful for monitoring and analytics.
   */
  async getStatistics(): Promise<{
    totalPatterns: number;
    averageSuccessRate: number;
    totalUsageCount: number;
    mostUsedPattern?: LearnedPattern;
    mostSuccessfulPattern?: LearnedPattern;
  }> {
    const patterns = Array.from(this.patterns.values());
    
    if (patterns.length === 0) {
      return {
        totalPatterns: 0,
        averageSuccessRate: 0,
        totalUsageCount: 0
      };
    }
    
    const averageSuccessRate = patterns.reduce((sum, p) => sum + p.successRate, 0) / patterns.length;
    const totalUsageCount = patterns.reduce((sum, p) => sum + p.usageCount, 0);
    
    const mostUsedPattern = patterns.reduce((max, current) => 
      current.usageCount > max.usageCount ? current : max
    );
    
    const mostSuccessfulPattern = patterns.reduce((max, current) => 
      current.successRate > max.successRate ? current : max
    );
    
    return {
      totalPatterns: patterns.length,
      averageSuccessRate,
      totalUsageCount,
      mostUsedPattern,
      mostSuccessfulPattern
    };
  }
}