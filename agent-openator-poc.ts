import { initAgentsPoc, ChatOpenAI, Variable } from './src';

console.log('✈️ AgentsPoc Flight Assistant POC - Automated Flight Deal Search');
console.log('=========================================================\n');

// Initialize logger for debugging (optional)
console.log('🔧 Initializing AgentsPoc Flight Assistant with ChatOpenAI...\n');

// Main function to run the flight assistant
async function main(): Promise<void> {
  try {
    console.log('Starting AgentsPoc flight search...\n');
    
    // Hard-coded input using domain-based approach
    const domain = 'flights.jeffreykeyser.net';
    console.log(`📝 Target Domain: "${domain}"\n`);
    
    // Create credentials variables (REPLACE WITH YOUR ACTUAL CREDENTIALS)
    const username = new Variable({
      name: 'username',
      value: 'test@email.com', // TODO: Replace with actual username
      isSecret: false
    });
    
    const password = new Variable({
      name: 'password',
      value: 'password', // TODO: Replace with actual password  
      isSecret: true
    });

    // Initialize ChatOpenAI with configuration
    const llm = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'o4-mini',
      temperature: 0.3, // Lower temperature for more consistent extraction
    });
    
    // Initialize AgentsPoc
    const agentsPoc = initAgentsPoc({
      llm,
      headless: false, // Show browser for demo purposes
      variables: [username, password]
    });
    
    console.log('🔄 AgentsPoc is logging in and searching for flights...\n');
    
    // Execute flight search with login and filtering
    const openatorResult = await agentsPoc.start(
      `https://${domain}`,
      `You are a flight assistant that helps find flight deals. Complete this task in the following steps in order:

      STEP 1 - LOGIN:
      1. Find and fill the login form on this website
      2. Look for username/email field and enter: {{username}}
      3. Look for password field and enter: {{password}}  
      4. Click the login/sign-in button to authenticate
      5. If modal is hidden, you can assume login was successful and don't have to repeat this process

      STEP 2 - FILTER FOR FLIGHTS:
      7. Click on the Filter input element to show the filters on the screen
      8. Now only adjust the following filters:
        - Adjust "Quick Filter" to "Next Month"
      9. Filters should automatically apply and the page will update to show the filtered results

      STEP 3 - EXTRACT FLIGHT DEALS:
      10. Extract the top 3-5 flight deals to destinations outside of United States and return them in this JSON format:

      -- Flight Deals JSON format --
      {
        "searchCriteria": "Best flight deals to destinations outside of United States",
        "deals": [
          {
            "origin": "Origin city/airport",
            "destination": "Destination city/airport", 
            "departureDate": "Departure date",
            "returnDate": "Return date (if round-trip)",
            "price": "Total price with currency",
            "airline": "Airline name",
            "duration": "Flight duration or stops",
            "dealScore": "Any deal rating/score if available"
          }
        ],
        "totalFound": "Number of deals found",
        "url": "Final page URL where deals were found"
      }

      IMPORTANT NOTES:
      - Use the variable {{username}} and {{password}} for login credentials
      - If login fails, describe what happened and try alternative login methods
      - If no October flights are available, find the best available deals and note the actual timeframe
      - Extract real data from the page, not placeholder information
      - Return ONLY the JSON format requested above`
    );
    
    console.log(`✅ Flight search completed with status: ${openatorResult.status}!\n`);
    
    // Display the extracted flight deals
    console.log('✈️ FLIGHT DEALS RESULTS');
    console.log('═'.repeat(50));
    
    // Try to parse and format the result
    try {
      // Attempt to parse as JSON if it's structured data
      let parsedResult;
      const result = openatorResult.result;
      if (typeof result === 'string' && result.trim().startsWith('{')) {
        parsedResult = JSON.parse(result);
        console.log(JSON.stringify(parsedResult, null, 2));
      } else {
        // If not JSON, display the raw result
        console.log('Raw flight data:');
        console.log(result);
      }
    } catch (parseError) {
      console.log('Raw flight search result:');
      console.log(openatorResult.result);
      console.log('\n⚠️  Note: Result may need manual parsing');
    }
    
    console.log('═'.repeat(50));
    console.log('\n🎉 Flight Assistant POC completed successfully!');
    console.log('💡 This demonstrates automated flight searching with login and filtering');
    
  } catch (error) {
    console.error('❌ Error running AgentsPoc:', error);
    
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
    console.log('🔄 Waiting for 180 seconds...');
    process.exit(0);
  }, 180000);

}

export { main };