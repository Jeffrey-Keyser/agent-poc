import { Agent, run, tool, getLogger, webSearchTool } from '@openai/agents';
import { chromium, Page } from 'playwright';

// STEP 1: Import and configure the SDK with API key
// The SDK will automatically read the OPENAI_API_KEY environment variable
// Alternatively, you can set it programmatically (uncomment lines below):
// import { setDefaultOpenAIKey } from '@openai/agents';
// setDefaultOpenAIKey('sk-your-api-key-here');

// Initialize logger for debugging (optional)
const logger = getLogger('cost-tracking');

console.log('🤖 OpenAI Agents SDK Proof of Concept - Visual Pricing Analyzer');
console.log('=========================================================\n');

// Token usage tracking variables
let totalTokensUsed = 0;

// Define interfaces for type safety
interface UsageData {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface UsageDetail {
  callIndex: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
}

interface UsageData {
  totalTokens: number;
  details: UsageDetail[];
}

// Function to extract usage from raw responses
function extractUsageFromRawResponses(rawResponses: any[], model: string): UsageData {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const details: UsageDetail[] = [];
  
  rawResponses.forEach((response: any, index: number) => {
    if (response?.usage) {
      const usage: any = response.usage;
      const inputTokens = usage.prompt_tokens || 0;
      const outputTokens = usage.completion_tokens || 0;
      const totalForThisCall = usage.total_tokens || (inputTokens + outputTokens);
      
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      
      details.push({
        callIndex: index + 1,
        inputTokens,
        outputTokens,
        totalTokens: totalForThisCall,
        model: model,
      });
      
      console.log(`📊 Call ${index + 1} - Input: ${inputTokens} tokens, Output: ${outputTokens} tokens, Total: ${totalForThisCall} tokens`);
    }
  });
  
  const totalTokens = totalInputTokens + totalOutputTokens;
  
  return { totalTokens, details };
}

// Define the tool parameters interface for type safety
interface DiscoverPricingParams {
  domain: string;
}

interface ExtractPricingParams {
  url: string;
}


// Auto-scroll function to load dynamic content
async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = (document as any).body.scrollHeight;
        (window as any).scrollBy(0, distance);
        totalHeight += distance;
        
        if(totalHeight >= scrollHeight){
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}


// STEP 2a: Define a tool to prepare search queries for pricing discovery
const preparePricingSearchTool = tool({
  name: 'prepare_pricing_search',
  description: 'Prepare a search query to find pricing page URLs for a given domain',
  parameters: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        description: 'The domain to search for pricing (e.g., tailscale.com)'
      }
    },
    required: ['domain'],
    additionalProperties: false
  },
  execute: async (args: unknown) => {
    const params = args as DiscoverPricingParams;
    console.log(`🔍 Preparing search query for domain: ${params.domain}`);
    
    try {
      // Extract company name from domain for better search
      const companyName = params.domain.replace(/\.(com|org|net|io|co).*/, '');
      const searchQuery = `${companyName} pricing plans site:${params.domain}`;
      
      console.log(`🔍 Prepared search query: "${searchQuery}"`);
      
      return {
        searchQuery,
        domain: params.domain,
        companyName,
        instruction: `Now use web_search_preview tool to search for: "${searchQuery}" and analyze the results to find the best pricing URL`
      };
    } catch (error) {
      console.error(`❌ Search preparation failed: ${error}`);
      throw error;
    }
  },
});

// STEP 2b: Define a visual pricing extraction tool
const visualPricingExtractorTool = tool({
  name: 'extract_pricing_visually',
  description: 'Navigate to a specific pricing URL, capture screenshot, and return for AI analysis',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The direct URL to the pricing page to analyze'
      }
    },
    required: ['url'],
    additionalProperties: false
  },
  execute: async (args: unknown) => {
    const params = args as ExtractPricingParams;
    console.log(`📸 Capturing pricing page: ${params.url}`);
    
    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      
      // Set viewport for consistent captures
      await page.setViewportSize({ width: 1920, height: 1080 });
      
      // Navigate and wait for network idle
      await page.goto(params.url, { waitUntil: 'networkidle' });
      
      // Auto-scroll to capture lazy-loaded content
      await autoScroll(page);
      
      // Take screenshot
      const screenshot = await page.screenshot({ 
        fullPage: false,
        type: 'jpeg',
        quality: 70
      });
      
      await browser.close();
      
      const base64Image = screenshot.toString('base64');
      console.log(`✅ Pricing screenshot captured (${screenshot.length} bytes)`);
      
      return {
        type: 'image',
        image_url: {
          url: `data:image/jpeg;base64,${base64Image}`
        },
        detail: 'high',
        analyzedUrl: params.url
      };
    } catch (error) {
      console.error(`❌ Pricing extraction failed: ${error}`);
      throw error;
    }
  },
});

// STEP 3: Define a smart pricing analyzer agent
const pricingAnalyzerAgent = new Agent({
  name: 'Smart Pricing Analyzer',
  
  instructions: `You are an expert at discovering and analyzing pricing information from websites.

  PROCESS:
  1. When given a domain, use prepare_pricing_search tool to create the search query
  2. Use the web_search_preview tool with the prepared query to find pricing pages
  3. Analyze the search results to identify the best pricing URL:
     - Prefer URLs with /pricing, /plans, /price in the path
     - Look for "Pricing", "Plans", "Price" in page titles/descriptions
     - If no dedicated pricing page found, check the homepage
  4. Use extract_pricing_visually with the selected URL to capture the pricing page
  5. Analyze the screenshot to extract structured pricing information
  
  URL SELECTION FROM SEARCH RESULTS:
  - Prioritize URLs containing: /pricing, /plans, /price, /subscription
  - Look for titles mentioning: "Pricing", "Plans", "Packages", "Subscription"
  - Select the most specific pricing URL from the results
  - Avoid generic pages like /about, /contact, /blog
  
  PRICING ANALYSIS:
  When analyzing pricing screenshots:
  1. Identify all pricing tiers/plans (Free, Basic, Pro, Enterprise, etc.)
  2. Extract exact price amounts and currency for each tier
  3. Note billing periods (monthly/yearly/one-time)
  4. List key features for each tier
  5. Identify highlighted/recommended plans
  6. Note any special offers or discounts
  7. Extract call-to-action button text
  
  OUTPUT FORMAT:
  Return structured JSON with:
  - url: the analyzed URL
  - extractionMethod: "web-search-discovery"
  - timestamp: current ISO timestamp
  - pricingTiers: array of tier objects with:
    - tierName: plan name
    - price: {amount, currency, period}
    - features: array of feature strings
    - highlighted: boolean
    - ctaText: call-to-action text
  - specialOffers: array of offer strings
  - notes: any additional observations`,
  
  model: 'gpt-4o',
  tools: [preparePricingSearchTool, visualPricingExtractorTool, webSearchTool({ searchContextSize: 'medium' })],
});

// STEP 4: Main function to run the agent with hard-coded input
async function main(): Promise<void> {
  try {
    console.log('Starting agent execution...\n');
    
    // Hard-coded input using domain-based approach
    const userInput = 'Please analyze the pricing for tailscale.com';
    console.log(`📝 User Input: "${userInput}"\n`);
    
    // STEP 5: Run the agent - this handles the full conversation flow
    console.log('🔄 Agent is processing...\n');
    const result = await run(pricingAnalyzerAgent, userInput);
    
    // STEP 6: Extract and display token usage information
    console.log('\n📊 TOKEN USAGE ANALYSIS');
    console.log('═'.repeat(50));
    
    // Check if we have raw response data for usage calculation
    if (result.rawResponses && result.rawResponses.length > 0) {
      const usageData = extractUsageFromRawResponses(result.rawResponses, 'gpt-4o');
      totalTokensUsed += usageData.totalTokens;
      
      console.log(`📊 Total Tokens Used: ${usageData.totalTokens}`);
      console.log(`📈 Running Total: ${totalTokensUsed} tokens`);
      
      // Show detailed breakdown if multiple calls were made
      if (usageData.details.length > 1) {
        console.log('\n📋 Detailed Breakdown:');
        usageData.details.forEach((detail: UsageDetail) => {
          console.log(`  Call ${detail.callIndex}: Input: ${detail.inputTokens}, Output: ${detail.outputTokens}, Total: ${detail.totalTokens}`);
        });
      }
      
      // Get last response ID for tracking
      if (result.lastResponseId) {
        console.log(`🆔 Last Response ID: ${String(result.lastResponseId)}`);
      }
    } else {
      console.log('⚠️  No raw response data available for token usage calculation');
      console.log('💡 Try setting DEBUG=openai-agents:* to see more details');
      
      // Alternative: Try to get basic information from result object
      logger.debug('Available result properties:', Object.keys(result));
      if ((result as any).usage) {
        console.log('📊 Found usage data in result:', (result as any).usage);
      }
    }
    
    console.log('═'.repeat(50));
    
    // STEP 7: Print the agent's response
    console.log('\n📊 Pricing Analysis:');
    console.log('─'.repeat(50));
    
    // Try to parse structured pricing from response
    try {
      const pricingData = JSON.parse(result.finalOutput || '{}');
      console.log(JSON.stringify(pricingData, null, 2));
    } catch {
      console.log(result.finalOutput || 'No output available');
    }
    
    console.log('─'.repeat(50));
    
    console.log('\n🎉 Demo completed successfully!');
    
  } catch (error) {
    console.error('❌ Error running agent:', error);
    
    // Provide helpful error messages for common issues
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        console.log('\n💡 Make sure to set your OpenAI API key:');
        console.log('   export OPENAI_API_KEY=sk-your-key-here');
      }
      if (error.message.includes('insufficient_quota')) {
        console.log('\n💡 Check your OpenAI account has sufficient credits');
      }
    }
  }
}

// Execute the demo
if (require.main === module) {
  main();
}

export { pricingAnalyzerAgent, preparePricingSearchTool, visualPricingExtractorTool };