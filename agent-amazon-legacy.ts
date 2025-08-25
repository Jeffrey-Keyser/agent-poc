#!/usr/bin/env node

/**
 * Amazon Legacy Agent - Using the original agents-poc system
 * 
 * This demonstrates the legacy system before migration.
 */

import { initAgents, UnifiedAgentConfig } from './src/index';
import { ChatOpenAI } from './src/models/chat-openai';
import { Variable } from './src/core/entities/variable';

async function main() {
  console.log('🔧 Amazon Legacy Agent - Using Original System');
  console.log('=' .repeat(50));

  const config: UnifiedAgentConfig = {
    // Explicitly use legacy system
    useMultiAgent: false,
    
    llm: new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4o-mini',
      temperature: 0.3
    }),
    
    headless: false,
    
    variables: [
      new Variable({
        name: 'search_term',
        value: 'wireless headphones',
        isSecret: false
      }),
      new Variable({
        name: 'max_price',
        value: '100',
        isSecret: false
      })
    ]
  };

  try {
    console.log('🚀 Initializing legacy system...');
    const agent = initAgents(config);
    
    console.log('✅ Legacy system initialized successfully');
    console.log('📋 System type:', agent.constructor.name);
    
    // Example goals that work with the legacy system
    const goals = [
      'Navigate to Amazon homepage',
      'Search for {{search_term}}',
      'Apply price filter up to ${{max_price}}',
      'Extract the first 3 product names'
    ];
    
    console.log('\n🎯 Available test goals for legacy system:');
    goals.forEach((goal, index) => {
      console.log(`  ${index + 1}. ${goal}`);
    });
    
    console.log('\n💡 To run a goal, use the legacy system methods directly');
    console.log('   Example: agent.run({ goal: "Navigate to Amazon", variables: [...] })');
    
  } catch (error) {
    console.error('❌ Failed to initialize legacy system:', (error as Error).message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}