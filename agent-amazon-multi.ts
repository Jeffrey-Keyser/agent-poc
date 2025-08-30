import { initMultiAgent } from './src/init-multi-agent';
import { Variable } from './src/core/entities/variable';
import { ChatOpenAI } from './src/models/chat-openai';
import { truncateExtractedData } from './src/core/shared/utils';

/**
 * Amazon Multi-Agent Workflow Example
 * 
 * This example demonstrates how to use the new multi-agent architecture
 * to perform complex tasks on Amazon with strategic planning and execution.
 * 
 * The system will:
 * 1. Create a strategic plan (3-7 high-level steps)
 * 2. Execute each step using runtime DOM discovery
 * 3. Evaluate outcomes at the strategic level
 * 4. Replan automatically if steps fail
 */

async function main() {
  // Initialize the LLM for all agents
  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-5-nano',
    temperature: 0.1
  });
  
  // Configure variables (if needed)
  const variables: Variable[] = [
    new Variable({ name: 'search_term', value: 'wireless headphones', isSecret: false }),
    new Variable({ name: 'max_price', value: '100', isSecret: false })
  ];

  // Initialize the multi-agent system
  const workflow = initMultiAgent({
    llm,
    headless: false,
    variables,
    apiKey: process.env.OPENAI_API_KEY!, // For backward compatibility
    models: {
      planner: 'gpt-5-mini',    // Strategic planning - needs reasoning
      executor: 'gpt-5-mini',   // DOM interaction - needs adaptation
      evaluator: 'gpt-5-nano',  // Outcome validation - binary decisions
      errorHandler: 'gpt-5-mini' // Retry strategy - simple decisions
    },
    maxRetries: 3,
    timeout: 300000, // 5 minutes
    startUrl: 'https://amazon.com',
    verbose: true,
    reporterName: 'AmazonWorkflow'
  });

  try {
    console.log('🚀 Starting Amazon multi-agent workflow...');
    
    // Example 1: Product search with price filtering
    const searchResult = await workflow.executeWorkflow(
      'Search Amazon for dark roast caffeinated coffee beans and return the URL of the first item that has a rating of 4.5 or higher.'
    );
    
    console.log('📊 Search Results:', searchResult);
    
    if (searchResult.status === 'success') {
      console.log('✅ Workflow completed successfully!');
      // Truncate full page content for display to keep output manageable
      const displayData = truncateExtractedData(searchResult.extractedData, 500);
      console.log('📈 Extracted data:', displayData);
    } else {
      console.log('⚠️ Workflow completed with issues:', searchResult.status);
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