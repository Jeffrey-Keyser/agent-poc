import { initMultiAgent } from './src/init-multi-agent';
import { Variable } from './src/core/value-objects/variable';
import { ChatOpenAI } from './src/models/chat-openai';
import { truncateExtractedData } from './src/core/shared/utils';

/**
 * Amazon Multi-Agent Workflow Example
 * 
 * This example demonstrates how to use the new multi-agent architecture
 * to perform complex tasks on Amazon with strategic planning and execution.
 * 
 * The system will:
 * 1. Create a strategic plan
 * 2. Execute each step using runtime DOM discovery
 * 3. Evaluate outcomes at the strategic level
 * 4. Replan automatically if steps fail
 */

async function main() {
  // Initialize the LLM for all agents
  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-5-nano'
  });
  
  // Configure variables (if needed)
  const variables: Variable[] = [
    new Variable({ name: 'search_term', value: 'wireless headphones', isSecret: false }),
    new Variable({ name: 'max_price', value: '100', isSecret: false })
  ];

  const workflow = initMultiAgent({
    llm,
    headless: false,
    viewport: { width: 1920, height: 1080 },
    variables,
    models: {
      planner: 'gpt-5-mini',
      executor: 'gpt-5-mini', 
      evaluator: 'gpt-5-mini', 
      errorHandler: 'gpt-5-mini',
      summarizer: 'gpt-5-mini'
    },
    maxRetries: 3,
    timeout: 300000,
    verbose: true,
    reporterName: 'AmazonWorkflow'
  });

  try {
    console.log('🚀 Starting Amazon multi-agent workflow...');
    
    const result = await workflow.execute(
      'Find the cheapest wireless mouse under $20 with at least 4 stars and return the product URL.',
      'https://amazon.com'    
    );
    
    console.log('📊 Search Results:', result);
    
    if (result.status === 'success') {
      console.log('✅ Workflow completed successfully!');
      // Truncate full page content for display to keep output manageable
      const displayData = truncateExtractedData(result.extractedData, 500);
      console.log('📈 Extracted data:', displayData);
    } else {
      console.log('⚠️ Workflow completed with issues:', result.status);
    }
    
  } catch (error) {
    console.error('💥 Workflow error:', error instanceof Error ? error.message : String(error));
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
  } finally {
    // The workflow manager handles browser cleanup automatically
    console.log('🎯 Amazon workflow example completed');
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main as runAmazonWorkflow };