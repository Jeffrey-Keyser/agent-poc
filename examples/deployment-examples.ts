import { 
  initMultiAgentForEnvironment, 
  initMultiAgentWithCustomConfig,
  getRecommendedConfig
} from '../src/init-multi-agent';
import { ChatOpenAI } from '../src/models/chat-openai';

/**
 * Examples demonstrating different deployment configurations
 * for the multi-agent system
 */

// Initialize LLM (shared across examples)
const llm = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',
  temperature: 0.1
});

/**
 * Example 1: Development Environment
 * - Visual browser for debugging
 * - Detailed logging and screenshots
 * - Slower execution for observation
 */
async function developmentExample() {
  console.log('🔧 Development Environment Example');
  
  const workflow = initMultiAgentForEnvironment('development', llm, {
    startUrl: 'https://amazon.com',
    variables: [], // Add your variables here
  });
  
  const result = await workflow.executeWorkflow(
    'Search for "laptop" and extract the first 3 results'
  );
  
  console.log('Development Result:', result);
  return result;
}

/**
 * Example 2: Production Environment
 * - Headless browser for performance
 * - Minimal logging
 * - Optimized for speed and reliability
 */
async function productionExample() {
  console.log('🚀 Production Environment Example');
  
  const workflow = initMultiAgentForEnvironment('production', llm, {
    startUrl: 'https://github.com',
  });
  
  const result = await workflow.executeWorkflow(
    'Search for "TypeScript" repositories and get the top 5 most starred'
  );
  
  console.log('Production Result:', result);
  return result;
}

/**
 * Example 3: Testing Environment
 * - Fast execution for CI/CD
 * - Performance metrics enabled
 * - Screenshots only on failure
 */
async function testingExample() {
  console.log('🧪 Testing Environment Example');
  
  const workflow = initMultiAgentForEnvironment('testing', llm);
  
  // Shorter, more predictable workflow for testing
  const result = await workflow.executeWorkflow(
    'Navigate to Google and verify the search box is present'
  );
  
  console.log('Testing Result:', result);
  return result;
}

/**
 * Example 4: Custom Configuration
 * - Start with production base
 * - Add custom modifications for specific use case
 */
async function customConfigExample() {
  console.log('⚙️ Custom Configuration Example');
  
  // Get recommended config for e-commerce use case
  const ecommerceConfig = getRecommendedConfig('e-commerce');
  
  const workflow = initMultiAgentWithCustomConfig('production', llm, {
    ...ecommerceConfig,
    // Custom overrides
    timeout: 400000, // Extra time for complex e-commerce flows
    monitoring: {
      enableDetailedLogging: true, // Enable detailed logging even in production
      enablePerformanceMetrics: true,
      enableScreenshots: false,
      screenshotOnFailure: true
    },
    browser: {
      viewport: { width: 1920, height: 1080 }, // Full desktop viewport
      slowMo: 50 // Slight delay to avoid rate limiting
    }
  });
  
  const result = await workflow.executeWorkflow(
    'Search for "wireless mouse" under $50, add the top-rated one to cart'
  );
  
  console.log('Custom Config Result:', result);
  return result;
}

/**
 * Example 5: Environment-specific Workflow Patterns
 */
async function environmentSpecificPatterns() {
  console.log('🔄 Environment-specific Patterns');
  
  const environment = process.env.NODE_ENV as 'development' | 'production' || 'development';
  
  if (environment === 'development') {
    // Development: Comprehensive testing with visual feedback
    const workflow = initMultiAgentForEnvironment('development', llm, {
      verbose: true,
      startUrl: 'https://amazon.com'
    });
    
    return await workflow.executeWorkflow(
      'Test the complete search and filter flow: search for "headphones", apply price filter under $100, sort by rating, and extract top 3 results'
    );
    
  } else {
    // Production: Focused, efficient execution
    const workflow = initMultiAgentForEnvironment('production', llm, {
      timeout: 120000 // 2-minute timeout for production efficiency
    });
    
    return await workflow.executeWorkflow(
      'Search for "headphones" under $100 and return top 3 results'
    );
  }
}

/**
 * Example 6: Batch Processing Configuration
 * - Optimized for processing multiple workflows
 */
async function batchProcessingExample() {
  console.log('📦 Batch Processing Example');
  
  const workflow = initMultiAgentWithCustomConfig('production', llm, {
    limits: {
      maxConcurrentWorkflows: 5, // Process 5 workflows in parallel
      maxExecutionTime: 180000,  // 3 minutes each
      maxMemoryUsage: 2048       // 2GB memory limit
    },
    timeout: 180000, // 3-minute timeout per workflow
    maxRetries: 2,   // Fewer retries for batch processing efficiency
    monitoring: {
      enableDetailedLogging: false,
      enablePerformanceMetrics: true, // Track batch performance
      enableScreenshots: false,
      screenshotOnFailure: false
    }
  });
  
  // Example of batch processing multiple search queries
  const queries = [
    'Search for "laptop stand" and get top 3 results',
    'Search for "wireless keyboard" under $50',
    'Search for "monitor 4K" and extract specifications'
  ];
  
  const results = await Promise.allSettled(
    queries.map(query => workflow.executeWorkflow(query))
  );
  
  console.log('Batch Results:', results);
  return results;
}

// Export examples for use in other files
export {
  developmentExample,
  productionExample,
  testingExample,
  customConfigExample,
  environmentSpecificPatterns,
  batchProcessingExample
};

// Run examples if this file is executed directly
async function main() {
  const examples = process.argv.slice(2);
  
  try {
    if (examples.includes('development') || examples.length === 0) {
      await developmentExample();
    }
    
    if (examples.includes('production')) {
      await productionExample();
    }
    
    if (examples.includes('testing')) {
      await testingExample();
    }
    
    if (examples.includes('custom')) {
      await customConfigExample();
    }
    
    if (examples.includes('patterns')) {
      await environmentSpecificPatterns();
    }
    
    if (examples.includes('batch')) {
      await batchProcessingExample();
    }
    
  } catch (error) {
    console.error('Example error:', error.message);
  }
}

if (require.main === module) {
  main().catch(console.error);
}