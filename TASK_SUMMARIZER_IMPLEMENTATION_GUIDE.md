# Task Summarizer Agent Implementation Guide

## Overview

This document provides a step-by-step guide for implementing a **Task Summarizer Agent** that will be invoked upon workflow completion to produce clean, structured, and consumable summary objects. The agent follows the established pattern used by other agents in the system (TaskPlanner, TaskExecutor, TaskEvaluator).

## Problem Statement

Currently, when workflows complete (especially extraction tasks), the raw extracted data often contains:
- CSS styles and JavaScript code mixed with actual content
- Unstructured data that's difficult to consume
- No clear summary of what was actually accomplished
- Raw HTML/text content that needs cleaning

The Task Summarizer agent will solve these issues by providing a clean, structured summary of workflow results.

## Architecture Overview

```
Workflow Completion
        ↓
┌──────────────────┐
│ Workflow Manager │
└────────┬─────────┘
         │ Raw Results
         ↓
┌──────────────────┐
│ Task Summarizer  │ ← New Agent
│     Agent        │
└────────┬─────────┘
         │ Clean Summary
         ↓
┌──────────────────┐
│ Structured       │
│ Output Object    │
└──────────────────┘
```

## Implementation Steps

### Step 1: Create the Agent Directory Structure

Create a new directory for the Task Summarizer agent:

```bash
mkdir -p src/core/agents/task-summarizer
```

### Step 2: Define Agent Interfaces

**File:** `src/core/interfaces/agent.interface.ts`

Add these interfaces to the existing file (don't remove existing content):

```typescript
// Add these new interfaces to the existing file

export interface SummarizerInput {
  goal: string;                           // Original workflow goal
  plan: StrategicTask[];                  // The planned strategy from StrategicPlan.steps
  completedSteps: StepResult[];           // Array of step results (from Map values)
  extractedData: Record<string, any>;     // Raw extracted data collected during workflow
  totalDuration: number;                  // Total time in milliseconds
  startTime: Date;                        // When workflow started
  endTime: Date;                          // When workflow ended
  errors?: string[];                      // Errors collected from failed steps
  url?: string;                           // Final URL from browser
}

export interface SummarizerOutput {
  workflowId: string;                     // Unique workflow identifier
  objective: string;                      // Human-readable objective
  status: 'completed' | 'partial' | 'failed';
  summary: string;                        // Executive summary (2-3 sentences)
  
  // Extracted fields organized by category
  extractedFields: {
    label: string;                        // Human-readable label
    value: any;                           // The actual value
    source?: string;                      // Which step provided this
  }[];
  
  // Performance metrics
  performanceMetrics: {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    duration: string;                     // Human-readable (e.g., "2m 35s")
  };
  
  // Optional recommendations for future runs
  recommendations?: string[];
  
  // Metadata
  timestamp: Date;
  rawDataAvailable: boolean;             // Indicates if raw data is preserved
}

// Agent interface
export interface ITaskSummarizer extends IAgent<SummarizerInput, SummarizerOutput> {
  // No additional methods needed beyond base interface
}
```

### Step 3: Create the Summarizer Prompt

**File:** `src/core/agents/task-summarizer/task-summarizer.prompt.ts`

```typescript
export const TASK_SUMMARIZER_PROMPT = `
You are a Task Summarizer Agent responsible for creating clean, structured summaries of completed workflows.

CORE RESPONSIBILITIES:
1. Extract and clean meaningful data from raw workflow results
2. Organize information into structured, consumable formats
3. Remove technical artifacts (CSS, JavaScript, HTML) from extracted text
4. Provide executive summaries and extracted fields
5. Calculate performance metrics

DATA PROCESSING:
- Clean and extract meaningful data from raw HTML/CSS/JavaScript content
- Transform messy text into structured, readable format
- Identify and extract key information relevant to the workflow goal
- Present data in a clear, consumable format

CATEGORIZATION GUIDELINES:
Dynamically categorize extracted information based on workflow context:

EXAMPLES:

For E-commerce/Shopping:
- product: Product names, descriptions, SKUs
- price: Prices, discounts, shipping costs  
- availability: Stock status, delivery times
- rating: Star ratings, review counts

For Authentication/Profile Management:
- username: Account identifiers, display names
- profileData: Bio, descriptions, settings
- status: Login success, update confirmations
- metadata: Join dates, follower counts, activity stats

For Form Submissions:
- formFields: Input values, selections made
- validationStatus: Success/error messages
- confirmations: Reference numbers, submission IDs
- nextSteps: Follow-up actions required

For Data Extraction:
- primaryData: Main content extracted
- relatedData: Supporting information
- sourceMetadata: URLs, timestamps, page titles
- dataQuality: Completeness indicators

Always adapt categories to the specific workflow context

OUTPUT STRUCTURE:
Generate a JSON response with:
1. Executive summary (2-3 sentences of what was accomplished)
2. Cleaned data (if applicable)
3. Performance metrics
4. Recommendations for optimization (if any issues detected)

SPECIAL HANDLING BY WORKFLOW TYPE:

EXAMPLES:

For Authentication/Profile Management:
- Confirm successful login/logout
- Summarize profile changes made
- Extract user metadata (username, join date, stats)
- Note any security challenges (2FA, captcha)

For Form Submissions:
- Confirm what was submitted
- Extract confirmation/reference numbers
- Note validation messages
- Flag any errors or warnings

For E-commerce/Shopping:
- Focus on product details, pricing, availability
- Clean price data to show only the actual price
- Extract shipping and delivery information
- Note items added to cart or wishlist

For Data Extraction:
- Identify primary vs secondary data
- Note data quality and completeness
- Extract source metadata
- Flag missing or incomplete fields

For Navigation/Browsing:
- Summarize the journey taken
- Highlight key pages visited
- Note any obstacles encountered
- Extract final destination URL

EXAMPLE OUTPUT FORMATS:

Authentication Workflow:
{
  "summary": "Successfully authenticated GitHub account and updated profile bio with new description.",
  "extractedFields": [
    {
      "label": "Username",
      "value": "john-doe-developer",
      "source": "step-1"
    },
    {
      "label": "Profile URL",
      "value": "https://github.com/john-doe-developer",
      "source": "step-8"
    },
    {
      "label": "Bio Updated",
      "value": "Software developer passionate about automation",
      "source": "step-6"
    }
  ],
  "performanceMetrics": {
    "totalSteps": 8,
    "successfulSteps": 8,
    "failedSteps": 0,
    "duration": "1m 23s",
  }
}

E-commerce Workflow:
{
  "summary": "Found and added organic dark roast coffee to cart matching all criteria.",
  "extractedFields": [
    {
      "label": "Product Name",
      "value": "Organic Dark Roast Coffee Beans",
      "source": "step-3"
    },
    {
      "label": "Price",
      "value": "$24.99",
      "source": "step-3"
    },
    {
      "label": "Rating",
      "value": "4.7 stars (1,234 reviews)",
      "source": "step-3"
    }
  ],
  "performanceMetrics": {
    "totalSteps": 5,
    "successfulSteps": 5,
    "failedSteps": 0,
    "duration": "2m 15s",
  }
}

Remember: Your goal is to transform raw, messy workflow data into clean, actionable insights that applications can easily consume.
`;
```

### Step 4: Implement the Task Summarizer Agent

**File:** `src/core/agents/task-summarizer/task-summarizer.ts`

```typescript
import { LLM } from '../../interfaces/llm.interface';
import { ITaskSummarizer, SummarizerInput, SummarizerOutput } from '../../interfaces/agent.interface';
import { AgentConfig } from '../../types/agent-types';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { TASK_SUMMARIZER_PROMPT } from './task-summarizer.prompt';

export interface SummarizerConfig extends AgentConfig {
  includeRecommendations?: boolean;     // Default: true
  maxSummaryLength?: number;            // Default: 500 characters
}

/**
 * TaskSummarizerAgent - Creates structured summaries from workflow results
 * 
 * This agent processes raw workflow output and creates clean, consumable summaries.
 * It's especially important for extraction workflows where data often contains
 * HTML, CSS, and JavaScript artifacts that need to be cleaned.
 * 
 * Key responsibilities:
 * - Clean extracted data (remove CSS, JS, excessive HTML)
 * - Structure findings into categories
 * - Calculate performance metrics
 * - Generate actionable summaries
 */
export class TaskSummarizerAgent implements ITaskSummarizer {
  public readonly name = 'TaskSummarizer';
  public readonly model: string;
  public readonly maxRetries: number;
  
  private llm: LLM;
  private config: SummarizerConfig;
  
  // No extraction patterns needed - fields are simply mapped as strings

  constructor(llm: LLM, config: SummarizerConfig) {
    this.llm = llm;
    this.model = config.model;
    this.maxRetries = config.maxRetries || 3;
    this.config = {
      includeRecommendations: true,
      maxSummaryLength: 500,
      ...config
    };
    
    // Configuration initialized
  }

  /**
   * Execute summarization of workflow results
   */
  async execute(input: SummarizerInput): Promise<SummarizerOutput> {
    if (!this.validateInput(input)) {
      throw new Error('Invalid summarizer input provided');
    }

    // Pass the raw data directly to the LLM for processing
    
    const systemMessage = new SystemMessage({ content: TASK_SUMMARIZER_PROMPT });
    const userPrompt = this.buildUserPrompt(input, input.extractedData);
    const messages = [systemMessage, new HumanMessage({ content: userPrompt })];
    
    const parser = new JsonOutputParser<any>();
    const response = await this.llm.invokeAndParse(messages, parser);
    
    // Post-process the response
    const output = this.buildOutput(input, response);
    
    if (!this.validateOutput(output)) {
      throw new Error('Generated invalid summarizer output');
    }

    return output;
  }

  // Removed preCleanData - LLM handles cleaning directly


  /**
   * Build the prompt for the LLM
   */
  private buildUserPrompt(input: SummarizerInput, rawData: Record<string, any>): string {
    const successfulSteps = input.completedSteps.filter(s => s.success).length;
    const failedSteps = input.completedSteps.length - successfulSteps;
    
    return `
Please create a structured summary of this workflow execution:

WORKFLOW GOAL: ${input.goal}

EXECUTION SUMMARY:
- Total Steps: ${input.plan.length}
- Completed Steps: ${successfulSteps}
- Failed Steps: ${failedSteps}
- Duration: ${this.formatDuration(input.totalDuration)}
- Final URL: ${input.url || 'Not provided'}

STRATEGIC PLAN:
${input.plan.map((task, i) => `${i + 1}. ${task.name} - ${task.expectedOutcome}`).join('\n')}

STEP RESULTS:
${input.completedSteps.map(step => 
  `- Step ${step.stepId}: ${step.status === 'success' ? '✓ Success' : '✗ Failed'} ${step.errorReason || ''}`
).join('\n')}

EXTRACTED DATA:
${JSON.stringify(rawData, null, 2)}

${input.errors && input.errors.length > 0 ? `
ERRORS ENCOUNTERED:
${input.errors.join('\n')}
` : ''}

Please provide a structured summary following the format specified in your instructions.
${this.config.includeRecommendations ? 'Include recommendations for improving future runs.' : ''}
Focus on extracting clean, actionable data from the results.
`;
  }

  /**
   * Build the final output structure
   */
  private buildOutput(input: SummarizerInput, llmResponse: any): SummarizerOutput {
    const workflowId = `workflow-${Date.now()}`;
    const totalSteps = input.plan.length;
    const successfulSteps = input.completedSteps.filter(s => s.status === 'success').length;
    const failedSteps = input.completedSteps.filter(s => s.status !== 'success').length;
    
    // Determine status
    let status: 'completed' | 'partial' | 'failed';
    if (successfulSteps === totalSteps) {
      status = 'completed';
    } else if (successfulSteps === 0) {
      status = 'failed';
    } else {
      status = 'partial';
    }
    
    return {
      workflowId,
      objective: input.goal,
      status,
      summary: llmResponse.summary || this.generateDefaultSummary(input, status),
      extractedFields: llmResponse.extractedFields || [],
      performanceMetrics: {
        totalSteps,
        successfulSteps,
        failedSteps,
        duration: this.formatDuration(input.totalDuration)
      },
      recommendations: this.config.includeRecommendations ? 
        (llmResponse.recommendations || this.generateRecommendations(input)) : 
        undefined,
      timestamp: new Date(),
      rawDataAvailable: true
    };
  }

  /**
   * Generate a default summary if LLM fails
   */
  private generateDefaultSummary(input: SummarizerInput, status: string): string {
    const successCount = input.completedSteps.filter(s => s.success).length;
    return `Workflow ${status} with ${successCount}/${input.plan.length} steps completed in ${this.formatDuration(input.totalDuration)}. Goal: ${input.goal}`;
  }

  /**
   * Generate recommendations based on performance
   */
  private generateRecommendations(input: SummarizerInput): string[] {
    const recommendations: string[] = [];
    
    // Check for slow steps
    const avgTime = input.totalDuration / input.plan.length;
    const slowSteps = input.completedSteps.filter(s => s.duration > avgTime * 2);
    if (slowSteps.length > 0) {
      recommendations.push(`Optimize slow steps: ${slowSteps.map(s => s.stepId).join(', ')}`);
    }
    
    // Check for failures
    const failedSteps = input.completedSteps.filter(s => s.status !== 'success');
    if (failedSteps.length > 0) {
      recommendations.push(`Investigate failures in steps: ${failedSteps.map(s => s.stepId).join(', ')}`);
    }
    
    // Check for extraction issues
    if (input.extractedData && Object.keys(input.extractedData).length === 0) {
      recommendations.push('No data was extracted - verify selectors and page structure');
    }
    
    return recommendations;
  }

  /**
   * Format duration from milliseconds to human-readable
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  /**
   * Validate input data
   */
  validateInput(input: SummarizerInput): boolean {
    return !!(
      input &&
      input.goal &&
      input.plan &&
      Array.isArray(input.plan) &&
      input.completedSteps &&
      Array.isArray(input.completedSteps) &&
      input.startTime &&
      input.endTime &&
      // Validate StepResult structure
      input.completedSteps.every(step => 
        step.stepId && 
        step.status && 
        typeof step.duration === 'number'
      )
    );
  }

  /**
   * Validate output data
   */
  validateOutput(output: SummarizerOutput): boolean {
    return !!(
      output &&
      output.workflowId &&
      output.objective &&
      output.status &&
      output.summary &&
      output.extractedFields &&
      Array.isArray(output.extractedFields) &&
      output.performanceMetrics &&
      output.timestamp
    );
  }
}
```

### Step 5: Create the Index File

**File:** `src/core/agents/task-summarizer/index.ts`

```typescript
export { TaskSummarizerAgent } from './task-summarizer';
export { TASK_SUMMARIZER_PROMPT } from './task-summarizer.prompt';
export type { SummarizerConfig } from './task-summarizer';
```

### Step 6: Update the Agent Factory

**File:** `src/core/factories/agent-factory.ts`

Add this import at the top:
```typescript
import { TaskSummarizerAgent, SummarizerConfig } from '../agents/task-summarizer';
```

Add this method to the AgentFactory class:
```typescript
/**
 * Create a Task Summarizer Agent for generating clean workflow summaries
 * Uses efficient models for structured data extraction and cleaning
 */
static createSummarizer(config: SummarizerConfig): ITaskSummarizer {
  return new TaskSummarizerAgent(config.llm, config);
}
```

### Step 7: Update Workflow Manager Integration

**File:** `src/core/services/workflow-manager.ts`

1. Add the summarizer as a class property:
```typescript
private summarizer?: ITaskSummarizer;
```

2. Modify the constructor to accept summarizer in the config:
```typescript
export interface WorkflowManagerConfig {
  maxRetries?: number;
  timeout?: number;
  enableReplanning?: boolean;
  variableManager?: VariableManager;
  summarizer?: ITaskSummarizer;  // Add this field
}

constructor(
  private planner: ITaskPlanner,
  private executor: ITaskExecutor,
  private evaluator: ITaskEvaluator,
  private eventBus: EnhancedEventBusInterface,
  private browser: Browser,
  private domService: DomService,
  private reporter: AgentReporter,
  private config: WorkflowManagerConfig = {}
) {
  // ... existing code ...
  this.summarizer = config.summarizer;
}
```

3. Modify the `buildWorkflowResult` method to use the summarizer:
```typescript
private async buildWorkflowResult(): Promise<WorkflowResult> {
  const endTime = new Date();
  const duration = this.startTime ? endTime.getTime() - this.startTime.getTime() : 0;
  
  const successCount = Array.from(this.completedSteps.values())
    .filter(step => step.status === 'success').length;
  
  const totalSteps = this.completedSteps.size;
  
  // Base result object
  const baseResult = {
    id: `workflow-${Date.now()}`,
    goal: this.currentStrategy?.goal || '',
    status: successCount === totalSteps ? 'success' : 'partial' as any,
    completedSteps: Array.from(this.completedSteps.values()),
    failedTasks: Array.from(this.completedSteps.values())
      .filter(r => !r.success)
      .map(r => r.stepId),
    totalDuration: duration,
    duration,
    startTime: this.startTime || new Date(),
    endTime: endTime,
    extractedData: this.extractedData,
    summary: `Workflow completed with ${successCount}/${totalSteps} successful steps`
  };
  
  // If summarizer is available, enhance the result
  if (this.summarizer) {
    try {
      const summarizerInput: SummarizerInput = {
        goal: this.currentStrategy?.goal || '',
        plan: this.currentStrategy?.strategy || [],
        completedSteps: Array.from(this.completedSteps.values()),
        extractedData: this.extractedData,
        totalDuration: duration,
        startTime: this.startTime || new Date(),
        endTime: endTime,
        errors: this.errors,
        url: this.browser.getPage().url()
      };
      
      const structuredSummary = await this.summarizer.execute(summarizerInput);
      
      return {
        ...baseResult,
        structuredSummary,
        // Override the basic summary with the AI-generated one
        summary: structuredSummary.summary,
        // Add clean data alongside raw data
        cleanData: structuredSummary.extractedFields
      };
    } catch (error) {
      this.reporter.log(`⚠️ Summarizer failed, using basic result: ${error}`);
      // Fall back to base result if summarizer fails
      return baseResult;
    }
  }
  
  return baseResult;
}
```

### Step 8: Update Type Definitions

**File:** `src/core/types/agent-types.ts`

Add to the WorkflowResult interface:
```typescript
export interface WorkflowResult {
  // ... existing fields ...
  structuredSummary?: SummarizerOutput;  // Add this
  cleanData?: any;                       // Add this
}
```

### Step 9: Update Multi-Agent Initialization

**File:** `src/init-multi-agent.ts`

Update the initialization to include the summarizer:

```typescript
// In the initMultiAgent function, add:

// Create the summarizer if configured
const summarizer = AgentFactory.createSummarizer({
    llm,
    model: config.models?.summarizer || 'gpt-4o-mini',
    maxRetries: config.maxRetries || 3,
    includeRecommendations: true,
    maxSummaryLength: 500
  });

// Pass it to WorkflowManager
const workflowManager = new WorkflowManager(
  planner,
  executor,
  evaluator,
  eventBus,
  browser,
  domService,
  reporter,
  {
    maxRetries: config.maxRetries || 3,
    timeout: config.timeout,
    enableReplanning: true,
    variableManager,
    summarizer  // Add the summarizer to config
  }
);
```

## Configuration Options

Add to your workflow configuration:

```typescript
{
  models: {
    summarizer: 'gpt-4o-mini'       // Model to use for summarization
  },
  summarizerConfig: {
    includeRecommendations: true,   // Generate optimization tips
    maxSummaryLength: 500           // Max chars for summary
  }
}
```

## Troubleshooting

### Common Issues

1. **Summarizer not being invoked**
   - Verify the summarizer is passed to WorkflowManager

2. **Data still contains CSS/HTML**
   - Check that the LLM prompt includes clear instructions for cleaning
   - Verify the model is capable of handling HTML/CSS extraction
   - Consider using a more powerful model if needed

3. **Data extraction failing**
   - Add custom extraction patterns for your use case
   - Check the regex patterns match your data format
   - Verify field names trigger the correct extraction logic

4. **LLM response not matching expected format**
   - Review the prompt to ensure clarity
   - Check that the LLM model supports JSON output
   - Add validation and fallback logic

## Best Practices

1. **Always validate input and output** - Use the validation methods to ensure data integrity
2. **Provide fallbacks** - If the LLM fails, have default summaries ready
3. **Log failures** - Always log when summarization fails but don't break the workflow

## Future Enhancements

- Add support for different summary formats (XML, CSV)
- Implement caching for similar workflows
- Add ML-based data extraction for better cleaning
- Support for multi-language summaries
- Historical comparison of workflow performance
- Export summaries to external systems

## Conclusion

The Task Summarizer agent transforms raw, messy workflow data into clean, structured summaries that applications can easily consume. By following this guide, you'll implement a robust summarization system that enhances the usability of the multi-agent workflow system.