/**
 * Represents a learned pattern from previous workflow executions.
 * Used by the memory repository to store and retrieve execution patterns.
 */
export interface LearnedPattern {
  id: string;
  context: string;
  pattern: string;
  successRate: number;
  usageCount: number;
  createdAt: Date;
  lastUsedAt: Date;
  tags: string[];
  metadata?: Record<string, any>;
}

/**
 * Context information used for pattern matching.
 */
export interface PatternContext {
  goal: string;
  domain?: string;
  taskTypes: string[];
  previousAttempts?: number;
}

/**
 * Repository interface for managing learned patterns and memory.
 * Supports AI/LLM integration for pattern recognition and reuse.
 */
export interface MemoryRepository {
  /**
   * Save a new learned pattern to the repository.
   * @param pattern The learned pattern to save
   */
  savePattern(pattern: LearnedPattern): Promise<void>;

  /**
   * Find patterns similar to the given context.
   * @param context The context to match against
   * @param limit Optional limit for the number of results
   * @returns Array of similar patterns ordered by relevance
   */
  findSimilarPatterns(context: string, limit?: number): Promise<LearnedPattern[]>;

  /**
   * Find patterns by specific context information.
   * @param context Structured context for pattern matching
   * @param limit Optional limit for the number of results
   * @returns Array of matching patterns
   */
  findByContext(context: PatternContext, limit?: number): Promise<LearnedPattern[]>;

  /**
   * Update the success rate of a pattern based on execution results.
   * @param patternId The pattern ID to update
   * @param success Whether the pattern was successful
   */
  updatePatternSuccess(patternId: string, success: boolean): Promise<void>;

  /**
   * Find a pattern by its unique identifier.
   * @param id The pattern ID
   * @returns The pattern if found, undefined otherwise
   */
  findById(id: string): Promise<LearnedPattern | undefined>;

  /**
   * Find patterns by tags.
   * @param tags Array of tags to match
   * @param matchAll Whether all tags must match (AND) or any tag (OR)
   * @returns Array of patterns with matching tags
   */
  findByTags(tags: string[], matchAll?: boolean): Promise<LearnedPattern[]>;

  /**
   * Get the most successful patterns for a given context.
   * @param context The context to match against
   * @param limit Optional limit for the number of results
   * @returns Array of successful patterns ordered by success rate
   */
  findMostSuccessful(context: string, limit?: number): Promise<LearnedPattern[]>;

  /**
   * Update pattern metadata and usage statistics.
   * @param patternId The pattern ID to update
   * @param metadata Additional metadata to merge
   */
  updatePatternMetadata(patternId: string, metadata: Record<string, any>): Promise<void>;

  /**
   * Delete a pattern from the repository.
   * @param id The pattern ID to delete
   */
  delete(id: string): Promise<void>;

  /**
   * Get patterns that haven't been used recently (for cleanup).
   * @param olderThanDays Patterns older than this many days
   * @returns Array of unused patterns
   */
  findUnusedPatterns(olderThanDays: number): Promise<LearnedPattern[]>;

  /**
   * Count total number of patterns.
   * @returns Total count of patterns
   */
  count(): Promise<number>;
}