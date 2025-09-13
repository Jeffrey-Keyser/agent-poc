import { initMultiAgent } from './src/init-multi-agent';
import { Variable } from './src/core/value-objects/variable';
import { ChatOpenAI } from './src/models/chat-openai';
import { truncateExtractedData } from './src/core/shared/utils';

/**
 * Lululemon Multi-Agent Workflow Examples
 * 
 * This example demonstrates how to use the multi-agent architecture
 * for athletic apparel shopping on Lululemon with various use cases:
 * - Size availability tracking
 * - "We Made Too Much" deal hunting
 * - Outfit building within budget
 * - Store inventory checking
 * 
 * The system intelligently handles:
 * - Size variations (numeric and alpha sizing)
 * - Color and length variants
 * - Price filtering and budget constraints
 * - Both online and in-store availability
 */

// Workflow type definitions
type LululemonWorkflowType = 
  | 'size-tracker'
  | 'deal-hunter'
  | 'outfit-builder'
  | 'store-inventory'
  | 'restock-monitor';

interface LululemonWorkflowConfig {
  type: LululemonWorkflowType;
  parameters: {
    productName?: string;
    size?: string;
    colorPreferences?: string[];
    maxPrice?: number;
    category?: string;
    storeLocation?: string;
    outfitBudget?: number;
  };
}

/**
 * Generate workflow prompts based on the configuration
 */
function generateWorkflowPrompt(config: LululemonWorkflowConfig): string {
  switch (config.type) {
    case 'size-tracker':
      return `Find "${config.parameters.productName}" in size ${config.parameters.size} that are currently in stock. 
        Check availability in these colors: ${config.parameters.colorPreferences?.join(', ') || 'any color'}.
        Extract the product name, color, price, and available sizes for each matching item.`;

    case 'deal-hunter':
      return `Navigate to the "We Made Too Much" section and find ${config.parameters.category || 'women\'s leggings'} 
        under $${config.parameters.maxPrice || 100}. 
        Extract product names, original prices, sale prices, discount percentages, and available sizes.
        Focus on items with the best discounts.`;

    case 'outfit-builder':
      return `Build a complete ${config.parameters.category || 'yoga'} outfit under $${config.parameters.outfitBudget || 300}.
        Find a matching top and bottom in coordinating colors.
        Add one accessory that complements the outfit.
        Extract item names, colors, prices, and calculate the total outfit cost.
        Ensure all items are currently in stock in size ${config.parameters.size || 'medium'}.`;

    case 'store-inventory':
      return `Check if "${config.parameters.productName}" is available for in-store pickup 
        at ${config.parameters.storeLocation || 'nearest location'}.
        Find the product, select size ${config.parameters.size}, and check store availability.
        Extract which stores have it in stock and their distances.`;

    case 'restock-monitor':
      return `Navigate to "${config.parameters.productName}" and check if size ${config.parameters.size} 
        is back in stock in any color.
        If out of stock, find the restock notification option.
        Also extract 3 similar alternative products that are currently available in the requested size.`;

    default:
      throw new Error(`Unknown workflow type: ${config.type}`);
  }
}

/**
 * Execute a Lululemon shopping workflow
 */
async function executeLululemonWorkflow(config: LululemonWorkflowConfig) {
  console.log('\n🏃‍♀️ Starting Lululemon Workflow:', config.type);
  console.log('📋 Parameters:', config.parameters);

  // Initialize the LLM for all agents
  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-5-nano'
  });

  // Configure variables for personalized shopping
  const variables: Variable[] = [];

  // Add size preference as a variable if provided
  if (config.parameters.size) {
    variables.push(new Variable({
      name: 'preferredSize',
      value: config.parameters.size,
      isSecret: false
    }));
  }

  // Add budget as a variable if provided
  if (config.parameters.maxPrice || config.parameters.outfitBudget) {
    variables.push(new Variable({
      name: 'budget',
      value: String(config.parameters.maxPrice || config.parameters.outfitBudget),
      isSecret: false
    }));
  }

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
    reporterName: `Lululemon-${config.type}`
  });

  try {
    const prompt = generateWorkflowPrompt(config);
    console.log('\n🎯 Goal:', prompt);

    const result = await workflow.execute(
      prompt,
      'https://shop.lululemon.com'
    );

    console.log('\n📊 Workflow Status:', result.status);

    if (result.status === 'success') {
      const displayData = truncateExtractedData(result.extractedData, 1000);
      console.log('\n🛍️ Results Found:');
      console.log('─'.repeat(50));
      
      // Format the extracted data based on workflow type
      if (config.type === 'deal-hunter' && result.extractedData) {
        console.log('💰 We Made Too Much Deals:');
        formatDeals(result.extractedData);
      } else if (config.type === 'outfit-builder' && result.extractedData) {
        console.log('👗 Complete Outfit:');
        formatOutfit(result.extractedData);
      } else if (config.type === 'size-tracker' && result.extractedData) {
        console.log('📏 Size Availability:');
        formatSizeAvailability(result.extractedData);
      } else {
        console.log(JSON.stringify(displayData, null, 2));
      }
    } else {
      console.log('⚠️ Workflow completed with issues:', result.status);
    }

    // Show summary if available
    if (result.summary) {
      console.log('\n📝 Summary:', result.summary);
    }

  } catch (error) {
    console.error('💥 Workflow error:', error instanceof Error ? error.message : String(error));
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
  } finally {
    console.log('\n🎯 Lululemon workflow completed');
  }
}

/**
 * Format deals data for display
 */
function formatDeals(data: any) {
  if (Array.isArray(data)) {
    data.forEach((item: any, index: number) => {
      console.log(`\n${index + 1}. ${item.name || 'Product'}`);
      console.log(`   Original: $${item.originalPrice || 'N/A'}`);
      console.log(`   Sale: $${item.salePrice || 'N/A'}`);
      console.log(`   Discount: ${item.discount || 'N/A'}`);
      console.log(`   Sizes: ${item.sizes || 'Check website'}`);
    });
  }
}

/**
 * Format outfit data for display
 */
function formatOutfit(data: any) {
  if (data.items && Array.isArray(data.items)) {
    let total = 0;
    data.items.forEach((item: any) => {
      console.log(`\n• ${item.type || 'Item'}: ${item.name}`);
      console.log(`  Color: ${item.color || 'N/A'}`);
      console.log(`  Price: $${item.price || 0}`);
      total += parseFloat(item.price || 0);
    });
    console.log(`\n💵 Total Outfit Cost: $${total.toFixed(2)}`);
  }
}

/**
 * Format size availability data for display
 */
function formatSizeAvailability(data: any) {
  if (Array.isArray(data)) {
    data.forEach((item: any) => {
      console.log(`\n• ${item.name || 'Product'}`);
      console.log(`  Color: ${item.color || 'N/A'}`);
      console.log(`  Price: $${item.price || 'N/A'}`);
      console.log(`  Your Size Available: ${item.sizeAvailable ? '✅' : '❌'}`);
      if (item.alternativeSizes) {
        console.log(`  Other Sizes: ${item.alternativeSizes}`);
      }
    });
  }
}

/**
 * Main function with example workflows
 */
async function main() {
  // Check for command line arguments to determine which workflow to run
  const args = process.argv.slice(2);
  const workflowType = args[0] as LululemonWorkflowType;

  let config: LululemonWorkflowConfig;

  if (workflowType) {
    // Use command line specified workflow
    config = {
      type: workflowType,
      parameters: {
        productName: args[1] || 'Align High-Rise Pant',
        size: args[2] || '6',
        colorPreferences: args[3]?.split(',') || ['Black', 'Navy', 'Dark Olive'],
        maxPrice: args[4] ? parseInt(args[4]) : 100,
        category: args[5] || 'leggings'
      }
    };
  } else {
    // Default example: Size availability tracker for Align pants
    config = {
      type: 'size-tracker',
      parameters: {
        productName: 'Align High-Rise Pant 28"',
        size: '6',
        colorPreferences: ['Black', 'True Navy', 'Dark Olive'],
        maxPrice: 128
      }
    };

    // Uncomment to try other workflows:
    
    // Example 2: Deal hunter in "We Made Too Much"
    // config = {
    //   type: 'deal-hunter',
    //   parameters: {
    //     category: 'women\'s leggings',
    //     maxPrice: 89
    //   }
    // };

    // Example 3: Complete outfit builder
    // config = {
    //   type: 'outfit-builder',
    //   parameters: {
    //     category: 'yoga',
    //     size: 'medium',
    //     outfitBudget: 250
    //   }
    // };

    // Example 4: Store inventory check
    // config = {
    //   type: 'store-inventory',
    //   parameters: {
    //     productName: 'Scuba Oversized Funnel-Neck Half Zip',
    //     size: 'M/L',
    //     storeLocation: 'Seattle - University Village'
    //   }
    // };

    // Example 5: Restock monitor
    // config = {
    //   type: 'restock-monitor',
    //   parameters: {
    //     productName: 'Everywhere Belt Bag',
    //     size: 'OS',
    //     colorPreferences: ['Black', 'White Opal']
    //   }
    // };
  }

  await executeLululemonWorkflow(config);
}

// Run the example if this file is executed directly
if (require.main === module) {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           🧘‍♀️ Lululemon Multi-Agent Workflow 🧘‍♀️            ║
╠════════════════════════════════════════════════════════════╣
║  Usage:                                                    ║
║  npm run lululemon [type] [product] [size] [colors] [max] ║
║                                                            ║
║  Workflow Types:                                           ║
║  • size-tracker    - Track size availability               ║
║  • deal-hunter     - Find "We Made Too Much" deals         ║
║  • outfit-builder  - Build complete outfits                ║
║  • store-inventory - Check store availability              ║
║  • restock-monitor - Monitor for restocks                  ║
║                                                            ║
║  Example:                                                  ║
║  npm run lululemon size-tracker "Align Pant" 6 "Black"    ║
╚════════════════════════════════════════════════════════════╝
  `);

  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { executeLululemonWorkflow, LululemonWorkflowConfig };