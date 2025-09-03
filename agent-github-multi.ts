import { initMultiAgent } from './src/init-multi-agent';
import { Variable } from './src/core/value-objects/variable';
import { ChatOpenAI } from './src/models/chat-openai';

/**
 * GitHub Multi-Agent Workflow Example
 * 
 * This example demonstrates authentication workflows and complex
 * multi-step interactions using the multi-agent architecture.
 * 
 * Features demonstrated:
 * - Authentication handling
 * - Dynamic replanning when login fails
 * - Strategic vs tactical separation
 * - Secure variable handling
 */

async function main() {
  // Get credentials from environment (secure way)
  const username = process.env.GITHUB_USERNAME;
  const password = process.env.GITHUB_PASSWORD;
  
  if (!username || !password) {
    console.error('❌ Please set GITHUB_USERNAME and GITHUB_PASSWORD environment variables');
    process.exit(1);
  }
  
  // Initialize the LLM
  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-5-nano'
  });
  
  // Configure secure variables
  const variables: Variable[] = [
    new Variable({ 
      name: 'username', 
      value: username, 
      isSecret: false  // Username is not secret
    }),
    new Variable({ 
      name: 'password', 
      value: password, 
      isSecret: true   // Password is masked in logs
    })
  ];

  // Initialize multi-agent system
  const workflow = initMultiAgent({
    llm,
    headless: false,
    variables,
    models: {
      planner: 'gpt-5-nano',
      executor: 'gpt-5-nano',
      evaluator: 'gpt-5-nano',
      errorHandler: 'gpt-5-nano'
    },
    maxRetries: 3,
    timeout: 300000,
    verbose: true,
    reporterName: 'GitHubWorkflow'
  });

  try {
    console.log('🚀 Starting GitHub multi-agent workflow...');
    
    // Example 1: Login and profile update
    const loginResult = await workflow.executeWorkflow(
      'Login to GitHub with username {{username}} and password {{password}}, then navigate to profile settings and update bio to "Building the future with AI"'
    );
    
    console.log('🔐 Login Result:', loginResult);
    
    if (loginResult.status === 'success') {
      console.log('✅ Successfully logged in and updated profile!');
    } else {
      console.log('⚠️ Login workflow had issues:', loginResult.status);
    }
    
    // Example 2: Repository creation (uncomment to try)
    /*
    const repoResult = await workflow.executeWorkflow(
      'Create a new public repository named "multi-agent-test" with description "Testing multi-agent workflow system"'
    );
    
    console.log('📁 Repository Creation:', repoResult);
    */
    
    // Example 3: Search and star repositories (uncomment to try)
    /*
    const searchResult = await workflow.executeWorkflow(
      'Search for repositories with "multi-agent" keyword, find the top 3 most starred ones, and star them'
    );
    
    console.log('⭐ Repository Search & Star:', searchResult);
    */
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('💥 Workflow error:', errorMessage);
    
    if (errorMessage.includes('authentication') || errorMessage.includes('login')) {
      console.error('🔒 Authentication failed - please check your credentials');
    }
    
  } finally {
    console.log('🎯 GitHub workflow example completed');
  }
}

// Alternative: Simple search workflow (no authentication required)
async function runSearchOnlyWorkflow() {
  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-5-nano',
  });
  
  const workflow = initMultiAgent({
    llm,
    headless: false,
    variables: [],
    models: { planner: 'gpt-5-nano', executor: 'gpt-5-nano', evaluator: 'gpt-5-nano' },
    maxRetries: 2,
    reporterName: 'GitHubSearch'
  });
  
  try {
    const result = await workflow.executeWorkflow(
      'Search for "playwright automation" repositories and extract the top 5 results with their stars, descriptions, and main language'
    );
    
    console.log('🔍 Search Results:', result);
    return result;
  } catch (error) {
    console.error('Search error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

// Run the appropriate example
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--search-only')) {
    runSearchOnlyWorkflow().catch(console.error);
  } else {
    main().catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
  }
}

export { main as runGitHubWorkflow, runSearchOnlyWorkflow };