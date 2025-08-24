import { initAgentsPoc, ChatOpenAI, Variable } from './src';

console.log('🍕 AgentsPoc Grubhub Order Assistant POC - Automated Food Ordering');
console.log('================================================================\n');

// Initialize logger for debugging (optional)
console.log('🔧 Initializing AgentsPoc Grubhub Assistant with ChatOpenAI...\n');

// Main function to run the Grubhub ordering assistant
async function main(): Promise<void> {
  try {
    console.log('Starting AgentsPoc Grubhub order process...\n');
    
    // Target Grubhub website
    const domain = 'grubhub.com';
    console.log(`📝 Target Domain: "https://www.${domain}"\n`);
    
    // Create credentials and preferences variables (REPLACE WITH YOUR ACTUAL CREDENTIALS)
    const username = new Variable({
      name: 'username',
      value: 'test@email.com', // TODO: Replace with actual username/email
      isSecret: false
    });
    
    const password = new Variable({
      name: 'password',
      value: 'password', // TODO: Replace with actual password  
      isSecret: true
    });

    const deliveryAddress = new Variable({
      name: 'deliveryAddress',
      value: '123 Main St, City, State 12345', // TODO: Replace with actual delivery address
      isSecret: false
    });

    const restaurantPreference = new Variable({
      name: 'restaurantPreference',
      value: 'El Tucanazo Taqueria',
      isSecret: false
    });

    // Initialize ChatOpenAI with configuration
    const llm = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-4o-mini',
      temperature: 0.3, // Lower temperature for more consistent execution
    });
    
    // Initialize AgentsPoc
    const agentsPoc = initAgentsPoc({
      llm,
      headless: false, // Show browser for demo purposes
      variables: [username, password, deliveryAddress, restaurantPreference]
    });
    
    console.log('🔄 AgentsPoc is logging in and placing Grubhub order...\n');
    
    // Execute Grubhub ordering process
    const openatorResult = await agentsPoc.start(
      `https://www.${domain}`,
      `You are a food ordering assistant that helps place orders on Grubhub. Complete this task in the following steps in order:

      STEP 1 - LOGIN:
      1. Navigate to the Grubhub login page (look for "Sign in" or "Log in" button)
      2. Find and fill the login form
      3. Look for email/username field and enter: {{username}}
      4. Look for password field and enter: {{password}}  
      5. Click the login/sign-in button to authenticate
      6. Wait for successful login confirmation (usually redirects to main page or shows user profile)

      STEP 2 - FIND RESTAURANT:
      7. Search for restaurants using the cuisine preference: {{restaurantPreference}}
      8. Select a well-rated restaurant from the search results (look for 4+ star ratings)
      9. Navigate to the restaurant's menu page

      STEP 3 - SELECT FOOD ITEMS:
      10. Browse the menu and select 2-3 popular items (look for "Popular" or "Recommended" sections)
      11. Add each item to cart, customizing options when presented
      12. Ensure items are successfully added to cart (cart count should increase)

      STEP 4 - REVIEW CART:
      13. Navigate to cart/checkout page
      14. Review all selected items, quantities, and prices
      15. Proceed to checkout (but DO NOT complete the final payment)

      STEP 5 - EXTRACT ORDER DETAILS:
      16. Extract the order information and return it in this JSON format:

      -- Grubhub Order JSON format --
      {
        "orderSummary": "Grubhub order ready for checkout",
        "restaurant": {
          "name": "Restaurant name",
          "rating": "Restaurant rating if available",
          "estimatedDeliveryTime": "Estimated delivery time",
          "deliveryFee": "Delivery fee amount"
        },
        "deliveryAddress": "Final delivery address",
        "items": [
          {
            "name": "Item name",
            "description": "Item description",
            "price": "Individual item price",
            "quantity": "Quantity ordered",
            "customizations": "Any customizations made"
          }
        ],
        "orderTotal": {
          "subtotal": "Items subtotal",
          "tax": "Tax amount",
          "deliveryFee": "Delivery fee",
          "tip": "Suggested or entered tip",
          "total": "Final total amount"
        },
        "paymentMethod": "Payment method shown (last 4 digits if card)",
        "estimatedDeliveryTime": "Final estimated delivery time",
        "url": "Final checkout page URL"
      }

      IMPORTANT NOTES:
      - Use the variables {{username}}, {{password}}, {{deliveryAddress}}, and {{restaurantPreference}} for the respective inputs
      - If login fails, describe what happened and try alternative methods
      - Select items that are available and in stock
      - DO NOT complete the final payment - stop at the payment confirmation screen
      - Extract real data from the page, not placeholder information
      - Return ONLY the JSON format requested above
      - If any step fails, describe the issue and attempt to recover`
    );
    
    console.log(`✅ Grubhub order process completed with status: ${openatorResult.status}!\n`);
    
    // Display the extracted order details
    console.log('🍕 GRUBHUB ORDER RESULTS');
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
        console.log('Raw order data:');
        console.log(result);
      }
    } catch (parseError) {
      console.log('Raw Grubhub order result:');
      console.log(openatorResult.result);
      console.log('\n⚠️  Note: Result may need manual parsing');
    }
    
    console.log('═'.repeat(50));
    console.log('\n🎉 Grubhub Order Assistant POC completed successfully!');
    console.log('💡 This demonstrates automated food ordering with login and cart management');
    console.log('⚠️  Remember: Order was NOT finalized to prevent accidental charges');
    
  } catch (error) {
    console.error('❌ Error running Grubhub AgentsPoc:', error);
    
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
      if (error.message.includes('login') || error.message.includes('authentication')) {
        console.log('\n💡 Check your Grubhub login credentials are correct');
        console.log('   Update the username and password variables in the code');
      }
    }
  }
}

// Execute the demo
if (require.main === module) {
  main();

  // Wait for 180 seconds before exiting
  setTimeout(() => {
    console.log('🔄 Waiting for 360 seconds...');
    process.exit(0);
  }, 360000);
}

export { main };