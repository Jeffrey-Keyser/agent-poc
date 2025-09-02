import { InMemoryMemoryRepository } from '../in-memory-memory-repository';
import { LearnedPattern, PatternContext } from '../../../core/repositories/memory-repository';

describe('InMemoryMemoryRepository', () => {
  let repository: InMemoryMemoryRepository;
  let samplePattern: LearnedPattern;

  beforeEach(() => {
    repository = new InMemoryMemoryRepository();
    samplePattern = {
      id: 'pattern-1',
      context: 'amazon.com search page',
      pattern: 'When searching for products, use the search box in the header',
      successRate: 85,
      usageCount: 10,
      createdAt: new Date('2024-01-01'),
      lastUsedAt: new Date('2024-01-15'),
      tags: ['amazon.com', 'search', 'ecommerce'],
      metadata: {
        taskGoal: 'search for products',
        url: 'https://amazon.com',
        pageSection: 'header'
      }
    };
  });

  afterEach(async () => {
    await repository.clear();
  });

  describe('savePattern', () => {
    it('should save a pattern successfully', async () => {
      await expect(repository.savePattern(samplePattern)).resolves.not.toThrow();
      
      const retrieved = await repository.findById(samplePattern.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(samplePattern.id);
      expect(retrieved!.pattern).toBe(samplePattern.pattern);
      expect(retrieved!.successRate).toBe(samplePattern.successRate);
    });

    it('should throw error when saving pattern with existing ID', async () => {
      await repository.savePattern(samplePattern);
      
      await expect(repository.savePattern(samplePattern))
        .rejects.toThrow('Pattern with ID');
    });
  });

  describe('findById', () => {
    it('should return pattern when found', async () => {
      await repository.savePattern(samplePattern);
      
      const result = await repository.findById(samplePattern.id);
      expect(result).toBeDefined();
      expect(result!.id).toBe(samplePattern.id);
      expect(result!.pattern).toBe(samplePattern.pattern);
    });

    it('should return undefined when pattern not found', async () => {
      const result = await repository.findById('nonexistent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('findSimilarPatterns', () => {
    beforeEach(async () => {
      // Set up test patterns with different contexts and success rates
      const patterns: LearnedPattern[] = [
        {
          id: 'search-amazon-1',
          context: 'amazon.com product search page',
          pattern: 'Use main search bar for product searches',
          successRate: 90,
          usageCount: 20,
          createdAt: new Date('2024-01-01'),
          lastUsedAt: new Date('2024-01-20'),
          tags: ['amazon.com', 'search'],
          metadata: {}
        },
        {
          id: 'search-amazon-2',
          context: 'amazon.com category browsing',
          pattern: 'Navigate through categories for browsing',
          successRate: 75,
          usageCount: 15,
          createdAt: new Date('2024-01-02'),
          lastUsedAt: new Date('2024-01-18'),
          tags: ['amazon.com', 'browse'],
          metadata: {}
        },
        {
          id: 'search-ebay-1',
          context: 'ebay.com search functionality',
          pattern: 'Use advanced search for better results',
          successRate: 80,
          usageCount: 8,
          createdAt: new Date('2024-01-03'),
          lastUsedAt: new Date('2024-01-10'),
          tags: ['ebay.com', 'search'],
          metadata: {}
        },
        {
          id: 'old-pattern',
          context: 'amazon.com search from old experience',
          pattern: 'Old search method that might not work well',
          successRate: 60,
          usageCount: 5,
          createdAt: new Date('2023-01-01'),
          lastUsedAt: new Date('2023-06-01'), // Very old
          tags: ['amazon.com', 'search'],
          metadata: {}
        }
      ];

      for (const pattern of patterns) {
        await repository.savePattern(pattern);
      }
    });

    it('should find patterns similar to search context', async () => {
      const results = await repository.findSimilarPatterns('amazon search', 5);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
      
      // Should prioritize Amazon search patterns
      const amazonSearchPatterns = results.filter(p => 
        p.context.includes('amazon') && p.context.includes('search')
      );
      expect(amazonSearchPatterns.length).toBeGreaterThan(0);
    });

    it('should apply limit correctly', async () => {
      const results = await repository.findSimilarPatterns('search', 2);
      expect(results).toHaveLength(2);
    });

    it('should prioritize patterns with higher success rates', async () => {
      const results = await repository.findSimilarPatterns('amazon search', 10);
      
      // Should be sorted by score (which includes success rate)
      if (results.length > 1) {
        const firstResult = results[0];
        expect(firstResult.successRate).toBeGreaterThanOrEqual(80); // High success rate patterns first
      }
    });

    it('should penalize very old patterns', async () => {
      const results = await repository.findSimilarPatterns('amazon search', 10);
      
      // The old pattern should be ranked lower due to age penalty
      const oldPatternIndex = results.findIndex(p => p.id === 'old-pattern');
      if (oldPatternIndex !== -1) {
        expect(oldPatternIndex).toBeGreaterThan(0); // Not first
      }
    });
  });

  describe('findByContext', () => {
    beforeEach(async () => {
      const patterns: LearnedPattern[] = [
        {
          id: 'ecommerce-search-1',
          context: 'ecommerce product search on amazon',
          pattern: 'Use specific product keywords',
          successRate: 88,
          usageCount: 12,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          tags: ['amazon.com', 'ecommerce', 'search'],
          metadata: { recoveredFromFailure: false }
        },
        {
          id: 'ecommerce-search-2',
          context: 'ecommerce product search after failed attempt',
          pattern: 'Try alternative search terms when first search fails',
          successRate: 92,
          usageCount: 8,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          tags: ['ecommerce', 'search', 'recovery'],
          metadata: { recoveredFromFailure: true }
        },
        {
          id: 'auth-login-1',
          context: 'user authentication login process',
          pattern: 'Always check for email verification requirement',
          successRate: 95,
          usageCount: 25,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          tags: ['authentication', 'login'],
          metadata: {}
        }
      ];

      for (const pattern of patterns) {
        await repository.savePattern(pattern);
      }
    });

    it('should find patterns matching structured context', async () => {
      const context: PatternContext = {
        goal: 'search for products on ecommerce site',
        domain: 'amazon.com',
        taskTypes: ['search', 'ecommerce']
      };

      const results = await repository.findByContext(context, 5);
      
      expect(results.length).toBeGreaterThan(0);
      
      // Should find ecommerce search patterns
      const ecommercePatterns = results.filter(p => 
        p.tags.includes('ecommerce') || p.context.includes('ecommerce')
      );
      expect(ecommercePatterns.length).toBeGreaterThan(0);
    });

    it('should boost patterns that recovered from failure when previousAttempts > 0', async () => {
      const context: PatternContext = {
        goal: 'search for products',
        domain: 'amazon.com',
        taskTypes: ['search'],
        previousAttempts: 2 // Had previous failures
      };

      const results = await repository.findByContext(context, 5);
      
      // Pattern with recoveredFromFailure should be ranked higher
      const recoveredPattern = results.find(p => p.metadata?.recoveredFromFailure);
      expect(recoveredPattern).toBeDefined();
      
      if (results.length > 1) {
        const recoveredIndex = results.findIndex(p => p.metadata?.recoveredFromFailure);
        expect(recoveredIndex).toBe(0); // Should be first due to boost
      }
    });

    it('should match task types correctly', async () => {
      const authContext: PatternContext = {
        goal: 'login to user account',
        taskTypes: ['authentication', 'login']
      };

      const results = await repository.findByContext(authContext, 5);
      
      const authPatterns = results.filter(p => 
        p.tags.includes('authentication') || p.tags.includes('login')
      );
      expect(authPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('updatePatternSuccess', () => {
    beforeEach(async () => {
      await repository.savePattern(samplePattern);
    });

    it('should update success rate when pattern succeeds', async () => {
      const originalSuccessRate = samplePattern.successRate;
      const originalUsageCount = samplePattern.usageCount;
      
      await repository.updatePatternSuccess(samplePattern.id, true);
      
      const updated = await repository.findById(samplePattern.id);
      expect(updated).toBeDefined();
      expect(updated!.usageCount).toBe(originalUsageCount + 1);
      expect(updated!.successRate).toBeGreaterThanOrEqual(originalSuccessRate);
      expect(updated!.lastUsedAt.getTime()).toBeGreaterThan(samplePattern.lastUsedAt.getTime());
    });

    it('should update success rate when pattern fails', async () => {
      const originalSuccessRate = samplePattern.successRate;
      const originalUsageCount = samplePattern.usageCount;
      
      await repository.updatePatternSuccess(samplePattern.id, false);
      
      const updated = await repository.findById(samplePattern.id);
      expect(updated).toBeDefined();
      expect(updated!.usageCount).toBe(originalUsageCount + 1);
      expect(updated!.successRate).toBeLessThanOrEqual(originalSuccessRate);
    });

    it('should throw error when pattern not found', async () => {
      await expect(repository.updatePatternSuccess('nonexistent', true))
        .rejects.toThrow('Pattern with ID nonexistent not found');
    });
  });

  describe('findByTags', () => {
    beforeEach(async () => {
      const patterns: LearnedPattern[] = [
        {
          id: 'p1',
          context: 'context1',
          pattern: 'pattern1',
          successRate: 80,
          usageCount: 10,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          tags: ['search', 'amazon.com', 'ecommerce'],
          metadata: {}
        },
        {
          id: 'p2',
          context: 'context2',
          pattern: 'pattern2',
          successRate: 90,
          usageCount: 15,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          tags: ['login', 'authentication'],
          metadata: {}
        },
        {
          id: 'p3',
          context: 'context3',
          pattern: 'pattern3',
          successRate: 75,
          usageCount: 8,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          tags: ['search', 'ebay.com'],
          metadata: {}
        }
      ];

      for (const pattern of patterns) {
        await repository.savePattern(pattern);
      }
    });

    it('should find patterns with any matching tags (OR logic)', async () => {
      const results = await repository.findByTags(['search', 'login'], false);
      
      expect(results).toHaveLength(3); // All patterns match at least one tag
      
      const searchPatterns = results.filter(p => p.tags.includes('search'));
      const loginPatterns = results.filter(p => p.tags.includes('login'));
      
      expect(searchPatterns.length).toBe(2);
      expect(loginPatterns.length).toBe(1);
    });

    it('should find patterns with all matching tags (AND logic)', async () => {
      const results = await repository.findByTags(['search', 'amazon.com'], true);
      
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('p1');
    });

    it('should sort by success rate and usage count', async () => {
      const results = await repository.findByTags(['search'], false);
      
      expect(results).toHaveLength(2);
      
      // Should be sorted by success rate + usage count
      if (results.length > 1) {
        const firstScore = results[0].successRate + (results[0].usageCount * 0.1);
        const secondScore = results[1].successRate + (results[1].usageCount * 0.1);
        expect(firstScore).toBeGreaterThanOrEqual(secondScore);
      }
    });
  });

  describe('findMostSuccessful', () => {
    beforeEach(async () => {
      const patterns: LearnedPattern[] = [
        {
          id: 'high-success-1',
          context: 'successful search pattern',
          pattern: 'Very successful pattern',
          successRate: 95,
          usageCount: 20,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          tags: ['search'],
          metadata: {}
        },
        {
          id: 'high-success-2',
          context: 'another successful search',
          pattern: 'Another successful pattern',
          successRate: 90,
          usageCount: 25,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          tags: ['search'],
          metadata: {}
        },
        {
          id: 'low-success',
          context: 'less successful search',
          pattern: 'Less successful pattern',
          successRate: 60,
          usageCount: 5,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          tags: ['search'],
          metadata: {}
        },
        {
          id: 'new-pattern',
          context: 'new untested pattern',
          pattern: 'New pattern with high rate but low usage',
          successRate: 100,
          usageCount: 1,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          tags: ['search'],
          metadata: {}
        }
      ];

      for (const pattern of patterns) {
        await repository.savePattern(pattern);
      }
    });

    it('should return only highly successful patterns', async () => {
      const results = await repository.findMostSuccessful('search', 5);
      
      // Should filter for patterns with success rate >= 70% and usage count >= 2
      results.forEach(pattern => {
        expect(pattern.successRate).toBeGreaterThanOrEqual(70);
        expect(pattern.usageCount).toBeGreaterThanOrEqual(2);
      });
      
      expect(results).toHaveLength(2); // Only high-success-1 and high-success-2 qualify
    });

    it('should sort by success rate then usage count', async () => {
      const results = await repository.findMostSuccessful('search', 5);
      
      if (results.length > 1) {
        // First result should have higher success rate, or same success rate with higher usage
        expect(results[0].successRate).toBeGreaterThanOrEqual(results[1].successRate);
        if (results[0].successRate === results[1].successRate) {
          expect(results[0].usageCount).toBeGreaterThanOrEqual(results[1].usageCount);
        }
      }
    });

    it('should apply limit correctly', async () => {
      const results = await repository.findMostSuccessful('search', 1);
      expect(results).toHaveLength(1);
    });
  });

  describe('updatePatternMetadata', () => {
    beforeEach(async () => {
      await repository.savePattern(samplePattern);
    });

    it('should merge metadata correctly', async () => {
      const additionalMetadata = {
        newField: 'newValue',
        existingField: 'updatedValue'
      };
      
      await repository.updatePatternMetadata(samplePattern.id, additionalMetadata);
      
      const updated = await repository.findById(samplePattern.id);
      expect(updated).toBeDefined();
      expect(updated!.metadata).toEqual({
        ...samplePattern.metadata,
        ...additionalMetadata
      });
    });

    it('should throw error when pattern not found', async () => {
      await expect(repository.updatePatternMetadata('nonexistent', {}))
        .rejects.toThrow('Pattern with ID nonexistent not found');
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      await repository.savePattern(samplePattern);
    });

    it('should delete existing pattern successfully', async () => {
      await expect(repository.delete(samplePattern.id)).resolves.not.toThrow();
      
      const retrieved = await repository.findById(samplePattern.id);
      expect(retrieved).toBeUndefined();
    });

    it('should throw error when deleting non-existent pattern', async () => {
      await expect(repository.delete('nonexistent'))
        .rejects.toThrow('Pattern with ID nonexistent not found');
    });
  });

  describe('findUnusedPatterns', () => {
    beforeEach(async () => {
      const now = new Date();
      const old = new Date(now.getTime() - (40 * 24 * 60 * 60 * 1000)); // 40 days ago
      const recent = new Date(now.getTime() - (10 * 24 * 60 * 60 * 1000)); // 10 days ago
      
      const patterns: LearnedPattern[] = [
        {
          id: 'old-pattern',
          context: 'old unused pattern',
          pattern: 'Old pattern',
          successRate: 80,
          usageCount: 5,
          createdAt: old,
          lastUsedAt: old,
          tags: [],
          metadata: {}
        },
        {
          id: 'recent-pattern',
          context: 'recent pattern',
          pattern: 'Recent pattern',
          successRate: 90,
          usageCount: 10,
          createdAt: recent,
          lastUsedAt: recent,
          tags: [],
          metadata: {}
        }
      ];

      for (const pattern of patterns) {
        await repository.savePattern(pattern);
      }
    });

    it('should find patterns older than specified days', async () => {
      const unusedPatterns = await repository.findUnusedPatterns(30);
      
      expect(unusedPatterns).toHaveLength(1);
      expect(unusedPatterns[0].id).toBe('old-pattern');
    });

    it('should sort by last used date (oldest first)', async () => {
      const unusedPatterns = await repository.findUnusedPatterns(5);
      
      if (unusedPatterns.length > 1) {
        for (let i = 1; i < unusedPatterns.length; i++) {
          expect(unusedPatterns[i-1].lastUsedAt.getTime())
            .toBeLessThanOrEqual(unusedPatterns[i].lastUsedAt.getTime());
        }
      }
    });
  });

  describe('count', () => {
    it('should return correct count', async () => {
      expect(await repository.count()).toBe(0);
      
      await repository.savePattern(samplePattern);
      expect(await repository.count()).toBe(1);
      
      const anotherPattern = {
        ...samplePattern,
        id: 'pattern-2'
      };
      await repository.savePattern(anotherPattern);
      expect(await repository.count()).toBe(2);
    });
  });

  describe('getStatistics', () => {
    beforeEach(async () => {
      const patterns: LearnedPattern[] = [
        {
          id: 'p1',
          context: 'context1',
          pattern: 'pattern1',
          successRate: 90,
          usageCount: 20,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          tags: [],
          metadata: {}
        },
        {
          id: 'p2',
          context: 'context2',
          pattern: 'pattern2',
          successRate: 80,
          usageCount: 30,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          tags: [],
          metadata: {}
        },
        {
          id: 'p3',
          context: 'context3',
          pattern: 'pattern3',
          successRate: 70,
          usageCount: 10,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          tags: [],
          metadata: {}
        }
      ];

      for (const pattern of patterns) {
        await repository.savePattern(pattern);
      }
    });

    it('should return correct statistics', async () => {
      const stats = await repository.getStatistics();
      
      expect(stats.totalPatterns).toBe(3);
      expect(stats.averageSuccessRate).toBe(80); // (90 + 80 + 70) / 3
      expect(stats.totalUsageCount).toBe(60); // 20 + 30 + 10
      expect(stats.mostUsedPattern).toBeDefined();
      expect(stats.mostUsedPattern!.usageCount).toBe(30);
      expect(stats.mostSuccessfulPattern).toBeDefined();
      expect(stats.mostSuccessfulPattern!.successRate).toBe(90);
    });

    it('should handle empty repository', async () => {
      const stats = await repository.getStatistics();
      
      expect(stats.totalPatterns).toBe(0);
      expect(stats.averageSuccessRate).toBe(0);
      expect(stats.totalUsageCount).toBe(0);
      expect(stats.mostUsedPattern).toBeUndefined();
      expect(stats.mostSuccessfulPattern).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should clear all patterns', async () => {
      await repository.savePattern(samplePattern);
      expect(await repository.count()).toBe(1);
      
      await repository.clear();
      expect(await repository.count()).toBe(0);
    });
  });
});