import { initOpenator, ChatOpenAI } from 'openator';

console.log('🤖 Openator Pricing Analyzer POC - Visual Pricing Discovery');
console.log('=========================================================\n');

// Initialize logger for debugging (optional)
console.log('🔧 Initializing Openator with ChatOpenAI...\n');

// Main function to run the pricing analyzer
async function main(): Promise<void> {
  try {
    console.log('Starting Openator pricing analysis...\n');
    
    // Hard-coded input using domain-based approach
    const domain = 'stripe.com';
    console.log(`📝 Target Domain: "${domain}"\n`);
    
    // Initialize ChatOpenAI with configuration
    const llm = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-4o',
      temperature: 0.3, // Lower temperature for more consistent extraction
    });
    
    // Initialize Openator
    const openator = initOpenator({
      llm,
      headless: false, // Show browser for demo purposes
    });
    
    console.log('🔄 Openator is processing pricing discovery...\n');
    
    // Execute comprehensive pricing analysis by navigating directly to domain
    const result = await openator.start(
      `https://${domain}`,
      `Navigate to the pricing page on this website by:
      
      1. Looking for navigation links with text like: "Pricing", "Plans", "Price", "Subscription", "Packages", "Get Started"
      2. Check the main navigation menu, header, footer, or prominent buttons
      3. Click on the pricing/plans link to navigate there
      4. If no direct pricing link is found, look for "Products" or "Solutions" that might lead to pricing
      
      Once you reach the pricing page, extract the first tier or standard pricing information and return it in this structured JSON format:
      
      {
        "url": "the final pricing page URL",
        "extractionMethod": "openator-browser-automation",
        "timestamp": "${new Date().toISOString()}",
        "pricingTiers": [
          {
            "tierName": "plan name (e.g. Free, Basic, Standard, etc)",
            "price": {
              "amount": "price number only",
              "currency": "currency symbol or code",
              "period": "billing period (monthly/yearly/one-time)"
            },
            "features": ["list of key features for this tier"],
          }
        ],
        "specialOffers": ["any discounts or special offers mentioned"],
        "notes": "any additional observations about pricing structure"
      }
      
      Fallback to just returning the important information if the json parsing fails.

      Print out the json to the console.

      Make sure to:
      1. Find the official pricing page (not third-party sites)
      2. Extract exact prices, not approximations
      3. Include all available pricing tiers
      4. Note which plan is highlighted/recommended if any
      5. Capture any annual vs monthly pricing differences
      6. Return ONLY the JSON format requested above`
    );
    
    console.log('✅ Pricing analysis completed!\n');
    
    // Display the extracted pricing information
    console.log('📊 PRICING ANALYSIS RESULTS');
    console.log('═'.repeat(50));
    
    // Try to parse and format the result
    try {
      // Attempt to parse as JSON if it's structured data
      let parsedResult;
      if (typeof result === 'string' && result.trim().startsWith('{')) {
        parsedResult = JSON.parse(result);
        console.log(JSON.stringify(parsedResult, null, 2));
      } else {
        // If not JSON, display the raw result
        console.log('Raw extracted data:');
        console.log(result);
      }
    } catch (parseError) {
      console.log('Raw extraction result:');
      console.log(result);
      console.log('\n⚠️  Note: Result may need manual parsing');
    }
    
    console.log('═'.repeat(50));
    console.log('\n🎉 Openator POC completed successfully!');
    console.log('💡 This demonstrates browser automation with natural language instructions');
    
  } catch (error) {
    console.error('❌ Error running Openator:', error);
    
    // Provide helpful error messages for common issues
    if (error instanceof Error) {
      if (error.message.includes('API key') || error.message.includes('apiKey')) {
        console.log('\n💡 Make sure to set your OpenAI API key:');
        console.log('   export OPENAI_API_KEY=sk-your-key-here');
      }
      if (error.message.includes('insufficient_quota')) {
        console.log('\n💡 Check your OpenAI account has sufficient credits');
      }
      if (error.message.includes('browser') || error.message.includes('chromium')) {
        console.log('\n💡 Make sure browsers are installed:');
        console.log('   npm run install:browsers');
      }
    }
  }
}

// Execute the demo
if (require.main === module) {
  main();

  // Wait for 60 seconds before exiting
  setTimeout(() => {
    console.log('🔄 Waiting for 120 seconds...');
    process.exit(0);
  }, 120000);

}

export { main };