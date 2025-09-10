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
  const variables: Variable[] = [];

  const workflow = initMultiAgent({
    llm,
    headless: false,
    viewport: { width: 1920, height: 1080 },
    variables,
    models: {
      planner: 'gpt-5-nano',
      executor: 'gpt-5-nano', 
      evaluator: 'gpt-5-nano', 
      errorHandler: 'gpt-5-nano',
      summarizer: 'gpt-5-nano'
    },
    maxRetries: 3,
    timeout: 300000,
    verbose: true,
    reporterName: 'AmazonWorkflow'
  });

  try {
    console.log('🚀 Starting Amazon multi-agent workflow...');
    
    const result = await workflow.execute(
      'Can you find a collection of large size grey and black fruit of the loom shirts for men and place them into my cart.',
      'https://amazon.com'    
    );
    
    console.log('📊 Search Results:', result);
    
    if (result.status === 'success') {
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