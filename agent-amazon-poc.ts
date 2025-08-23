import { initAgentsPoc, ChatOpenAI, Variable } from './src';

console.log('📦 AgentsPoc Amazon Shopping Assistant POC - Automated Product Shopping');
console.log('====================================================================\n');

// Initialize logger for debugging (optional)
console.log('🔧 Initializing AgentsPoc Amazon Assistant with ChatOpenAI...\n');

// Main function to run the Amazon shopping assistant
async function main(): Promise<void> {
  try {
    console.log('Starting AgentsPoc Amazon shopping process...\n');
    
    // Target Amazon website
    const domain = 'amazon.com';
    console.log(`📝 Target Domain: "https://www.${domain}"\n`);
    
    // Create credentials and shopping preferences variables (REPLACE WITH YOUR ACTUAL CREDENTIALS)
    const username = new Variable({
      name: 'username',
      value: 'stormman32@gmail.com', // TODO: Replace with actual Amazon username/email
      isSecret: false
    });
    
    const password = new Variable({
      name: 'password',
      value: 'ATkK8jDR=f', // TODO: Replace with actual password  
      isSecret: true
    });

    const shippingAddress = new Variable({
      name: 'shippingAddress',
      value: 'TODO:', // TODO: Replace with actual shipping address
      isSecret: false
    });

    const searchTerms = new Variable({
      name: 'searchTerms',
      value: 'wireless headphones', // TODO: Replace with desired product search terms
      isSecret: false
    });

    const budgetLimit = new Variable({
      name: 'budgetLimit',
      value: '$100', // TODO: Replace with maximum budget per item
      isSecret: false
    });

    // Initialize ChatOpenAI with configuration
    const llm = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-5-mini',
      temperature: 0.3, // Lower temperature for more consistent execution
    });
    
    // Initialize AgentsPoc
    const agentsPoc = initAgentsPoc({
      llm,
      headless: false, // Show browser for demo purposes
      variables: [username, password, shippingAddress, searchTerms, budgetLimit]
    });
    
    console.log('🔄 AgentsPoc is logging in and shopping on Amazon...\n');
    
    // Execute Amazon shopping process
    const openatorResult = await agentsPoc.start(
      `https://www.${domain}`,
      `You are an Amazon shopping assistant that helps find and purchase products. Complete this task in the following steps in order:

      STEP 1 - LOGIN:
      1. Navigate to the Amazon sign-in page (look for "Sign in" or "Hello, Sign in" button)
      2. Find and fill the login form
      3. Look for email/phone field and enter: {{username}}
      4. Click "Continue" if prompted, then look for password field and enter: {{password}}
      5. Click the sign-in button to authenticate
      6. Handle any CAPTCHA or verification challenges if they appear
      7. If 2FA is required, hand off to the user to solve it manually
      8. Wait for successful login confirmation, on main page, you should see "Hello, [Name]" in the top right corner

      STEP 2 - PRODUCT SEARCH:
      9. Use the main search bar to search for: {{searchTerms}}
      10. Apply the following filters to narrow down results:
          - Customer Reviews: 4 stars and above
          - Price: Under {{budgetLimit}}
          - Prime eligible items only (if available)
      11. Sort results by "Best Sellers" or "Customer Reviews"

      STEP 3 - SELECT PRODUCTS:
      12. Select 2-3 highly-rated products from the filtered results
      13. For each product, click to view details and verify:
          - Price is within budget
          - Has good reviews (4+ stars with multiple reviews)
          - Prime eligible for fast shipping
          - In stock and available
      14. Add each selected product to cart

      STEP 4 - REVIEW CART:
      15. Navigate to shopping cart
      16. Review all items, quantities, and prices
      17. Apply any available coupons or promotions
      18. Proceed to checkout but DO NOT complete the final purchase

      STEP 5 - CHECKOUT REVIEW:
      19. Review shipping address and delivery options
      20. Review payment method (but don't enter new payment info)
      21. Get to the final order review page before "Place your order" button

      STEP 6 - EXTRACT ORDER DETAILS:
      22. Extract the complete order information and return it in this JSON format:

      -- Amazon Order JSON format --
      {
        "orderSummary": "Amazon cart ready for checkout",
        "shippingAddress": "Final shipping address",
        "items": [
          {
            "name": "Product name",
            "brand": "Product brand",
            "price": "Individual item price",
            "originalPrice": "Original price if on sale",
            "discount": "Discount amount if any",
            "quantity": "Quantity in cart",
            "rating": "Product rating (stars)",
            "reviewCount": "Number of reviews",
            "primeEligible": "true/false for Prime shipping",
            "inStock": "Stock status",
            "seller": "Sold by (Amazon or third party)",
            "estimatedDelivery": "Estimated delivery date"
          }
        ],
        "orderTotals": {
          "subtotal": "Items subtotal before tax",
          "shipping": "Shipping cost",
          "tax": "Tax amount",
          "promotions": "Promotional discounts applied",
          "total": "Final total amount"
        },
        "shippingOptions": {
          "selectedOption": "Chosen shipping method",
          "estimatedDelivery": "Estimated delivery date",
          "cost": "Shipping cost"
        },
        "paymentMethod": "Payment method shown (last 4 digits if card)",
        "orderProtections": "Any warranties or protection plans",
        "url": "Final checkout review page URL"
      }

      IMPORTANT NOTES:
      - Use the variables {{username}}, {{password}}, {{shippingAddress}}, {{searchTerms}}, and {{budgetLimit}} for respective inputs
      - If login fails or requires 2FA, describe the issue clearly
      - Only select products that meet the quality and budget criteria
      - DO NOT complete the final purchase - stop at the order review screen
      - If CAPTCHA appears, describe what you see and attempt to solve if possible
      - Extract real data from the page, not placeholder information
      - Return ONLY the JSON format requested above
      - If any step fails, describe the issue and attempt to recover or find alternatives`
    );
    
    console.log(`✅ Amazon shopping process completed with status: ${openatorResult.status}!\n`);
    
    // Display the extracted order details
    console.log('📦 AMAZON SHOPPING RESULTS');
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
        console.log('Raw shopping data:');
        console.log(result);
      }
    } catch (parseError) {
      console.log('Raw Amazon shopping result:');
      console.log(openatorResult.result);
      console.log('\n⚠️  Note: Result may need manual parsing');
    }
    
    console.log('═'.repeat(50));
    console.log('\n🎉 Amazon Shopping Assistant POC completed successfully!');
    console.log('💡 This demonstrates automated product research and cart management');
    console.log('⚠️  Remember: Order was NOT finalized to prevent accidental purchases');
    console.log('🔒 Items remain in cart for manual review and completion');
    
  } catch (error) {
    console.error('❌ Error running Amazon AgentsPoc:', error);
    
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
        console.log('\n💡 Check your Amazon login credentials are correct');
        console.log('   Update the username and password variables in the code');
        console.log('   Note: Amazon may require 2FA or CAPTCHA verification');
      }
      if (error.message.includes('CAPTCHA') || error.message.includes('verification')) {
        console.log('\n💡 Amazon detected automation and requires manual verification');
        console.log('   Try running with headless: false to manually solve CAPTCHAs');
      }
    }
  }
}

// Execute the demo
if (require.main === module) {
  main();

  // Wait for 180 seconds before exiting
  setTimeout(() => {
    console.log('🔄 Waiting for 180 seconds...');
    process.exit(0);
  }, 180000);
}

export { main };