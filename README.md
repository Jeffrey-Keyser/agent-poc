# OpenAI Agents SDK - TypeScript Proof of Concept

A minimal, self-contained TypeScript script demonstrating the basic functionality of the OpenAI Agents SDK.

## Overview

This proof-of-concept demonstrates:
- ✅ Import and configure the OpenAI Agents SDK
- ✅ Define a simple Agent with name and instructions
- ✅ Create a custom tool that fetches and summarizes content from URLs
- ✅ Run the agent with a hard-coded input that invokes the tool
- ✅ Track actual token usage from API responses

## Prerequisites

- **Node.js** 18 or higher
- **OpenAI API Key** (get one from [OpenAI Platform](https://platform.openai.com/account/api-keys))

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `@openai/agents` - The OpenAI Agents SDK
- `zod@3` - For schema validation (required by the SDK)
- TypeScript development dependencies

### 2. Set Up Your OpenAI API Key

**Option A: Environment Variable (Recommended)**
```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and add your actual API key
export OPENAI_API_KEY=sk-your-actual-api-key-here
```

**Option B: Set in Terminal Session**
```bash
export OPENAI_API_KEY=sk-your-actual-api-key-here
```

### 3. Run the Demo

```bash
npm start
```

## Expected Output

When you run the script successfully, you should see output similar to:

```
🤖 OpenAI Agents SDK Proof of Concept - URL Summarizer
======================================================

Starting agent execution...

📝 User Input: "Please fetch and summarize the content from https://www.example.com"

🔄 Agent is processing...

🔧 Fetching content from: https://www.example.com
✅ Successfully fetched content (1256 characters, truncated to 1256)

📊 TOKEN USAGE ANALYSIS
══════════════════════════════════════════════════
📊 Call 1 - Input: 485 tokens, Output: 127 tokens, Total: 612 tokens
📊 Total Tokens Used: 612
📈 Running Total: 612 tokens
🆔 Last Response ID: resp_xyz789uvw012
══════════════════════════════════════════════════

✅ Agent Response:
──────────────────────────────────────────────────
I've fetched the content from https://www.example.com and here's a summary:

The page appears to be a simple example website commonly used for demonstrations. 
It contains basic information about example domains and their usage for documentation 
and testing purposes. The main content explains that this domain may be used in 
examples without prior coordination or asking for permission.
──────────────────────────────────────────────────

🎉 Demo completed successfully!
```

### Token Usage Tracking Features

The enhanced script now includes:
- **Real-time token usage tracking** with input/output token breakdown
- **Actual API response data** instead of local pricing calculations
- **Running totals** across multiple agent runs
- **Response ID tracking** for audit trails
- **Detailed breakdowns** for multi-call operations

## Code Structure

### `agent-poc.ts` - Main Implementation

The script follows these key steps:

1. **Import and Configure SDK**
   ```typescript
   import { Agent, run, tool } from '@openai/agents';
   import { z } from 'zod';
   ```

2. **Define a URL Fetching Tool**
   ```typescript
   const fetchUrlTool = tool({
     name: 'fetch_url',
     description: 'Fetch content from a URL and return a summary',
     parameters: {
       type: 'object',
       properties: {
         url: { type: 'string', description: 'The URL to fetch and summarize' }
       },
       required: ['url']
     },
     execute: async (args) => {
       const response = await fetch(args.url);
       const content = await response.text();
       // Process and return truncated content
       return content;
     },
   });
   ```

3. **Create an Agent**
   ```typescript
   const webSummarizerAgent = new Agent({
     name: 'Web Summarizer',
     instructions: 'You are a helpful web content summarizer...',
     model: 'gpt-4o-mini',
     tools: [fetchUrlTool],
   });
   ```

4. **Run the Agent**
   ```typescript
   const result = await run(webSummarizerAgent, 'Please fetch and summarize https://www.example.com');
   console.log(result.finalOutput);
   ```

## Available Scripts

- `npm start` - Run the TypeScript file directly with ts-node
- `npm run dev` - Run with file watching (restarts on changes)
- `npm run build` - Compile TypeScript to JavaScript
- `npm run build:run` - Build and run the compiled JavaScript
- `npm run clean` - Remove compiled files

## Key Components Explained

### Agent Configuration
- **name**: Identifies the agent
- **instructions**: Defines the agent's behavior and personality  
- **model**: Specifies which OpenAI model to use
- **tools**: Array of tools the agent can use
- **lifecycleHooks**: Callbacks for monitoring agent execution phases

### Tool Definition
- **name**: How the agent identifies the tool
- **description**: Helps the agent understand when to use the tool
- **parameters**: Zod schema for type-safe parameter validation
- **execute**: The actual function that runs when the tool is called

### Cost Tracking Components
- **MODEL_PRICING**: Current OpenAI pricing per 1K tokens (input/output rates)
- **calculateCost()**: Converts token usage to USD cost
- **extractUsageFromRawResponses()**: Parses raw API responses for usage data
- **lifecycleHooks**: Track execution phases and timing

### Execution Flow
1. Agent receives user input
2. **onRunStart** hook fires - tracking begins
3. Agent analyzes the request and determines it needs to use a tool
4. **onToolStart** hook fires - tool execution tracking begins
5. Agent calls the appropriate tool with extracted parameters
6. Tool executes and returns a result
7. **onToolEnd** hook fires - tool execution completed
8. Agent incorporates the tool result into its final response
9. **onRunEnd** hook fires - extract usage data from rawResponses
10. Calculate and display cost information

## Troubleshooting

### Common Issues

**"API key not found" error:**
```bash
# Make sure your API key is set
export OPENAI_API_KEY=sk-your-actual-key-here
npm start
```

**"Insufficient quota" error:**
- Check your OpenAI account has available credits
- Verify your API key has the correct permissions

**TypeScript compilation errors:**
```bash
# Clean and rebuild
npm run clean
npm run build
```

### Debug Mode

Enable different levels of debug logging:

**Full debug mode (most verbose):**
```bash
DEBUG=openai-agents:* npm start
```

**Only cost-related logs:**
```bash
DEBUG=openai-agents:cost-tracking npm start
```

**Only OpenAI API calls (includes token usage):**
```bash
DEBUG=openai-agents:openai npm start
```

**Core execution logs:**
```bash
DEBUG=openai-agents:core npm start
```

**Disable sensitive data logging:**
```bash
OPENAI_AGENTS_DONT_LOG_MODEL_DATA=1 npm start
```

## Cost Tracking Features

### What's Tracked
- **Token Usage**: Input tokens, output tokens, and totals per API call
- **Cost Calculation**: Real-time USD cost calculation using current OpenAI pricing
- **Response IDs**: Unique identifiers for each API response (useful for debugging)
- **Multi-call Tracking**: Detailed breakdown when multiple API calls are made
- **Running Totals**: Cumulative costs across multiple agent executions

### Pricing Information
The script includes current OpenAI pricing (as of 2024) for:
- **gpt-4o-mini**: $0.000150 input / $0.000600 output per 1K tokens
- **gpt-4o**: $0.005000 input / $0.015000 output per 1K tokens  
- **gpt-4**: $0.030000 input / $0.060000 output per 1K tokens

⚠️ **Note**: Pricing may change. Check [OpenAI's pricing page](https://openai.com/pricing) for current rates.

### Understanding the Output
```
💰 Call 1 - Input: 45 tokens, Output: 23 tokens, Cost: $0.000021
📊 Total Tokens Used: 68
💵 Total Cost: $0.000021
📈 Running Total: 68 tokens, $0.000021
🆔 Last Response ID: resp_xyz789uvw012
```

- **Call N**: Individual API call breakdown
- **Total Tokens**: Sum of input + output tokens for this execution
- **Total Cost**: Cost for this specific agent run
- **Running Total**: Cumulative across all runs in this session
- **Response ID**: OpenAI's unique identifier for the API response

## Next Steps

This proof-of-concept demonstrates the basics. You can extend it by:

- Adding more complex tools (web search, file operations, etc.)
- Implementing multi-agent workflows with handoffs
- Adding cost budgets and limits with automatic stopping
- Storing cost data in a database for analytics
- Creating cost reports and usage dashboards
- Adding error handling and retries with cost tracking
- Creating more sophisticated prompts and instructions
- Integrating with web frameworks for interactive demos
- Implementing cost optimization strategies (model selection, prompt engineering)

## Resources

- [OpenAI Agents SDK Documentation](https://github.com/openai/openai-agents-js)
- [OpenAI Platform](https://platform.openai.com/)
- [Zod Schema Validation](https://zod.dev/)

## License

MIT