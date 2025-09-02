import { LLM } from '../../interfaces/llm.interface';
import { ITaskPlanner, PlannerInput, PlannerOutput, ReplanContext } from '../../interfaces/agent.interface';
import { PlannerConfig, StrategicTask } from '../../types/agent-types';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { TASK_PLANNER_PROMPT } from './task-planner.prompt';

/**
 * TaskPlannerAgent - Creates high-level strategic plans for user goals
 * 
 * This agent thinks like a human user and creates plans with 3-7 strategic steps.
 * It focuses on WHAT to do, not HOW to do it (no DOM selectors or technical details).
 * 
 * Key principles:
 * - Use natural language for descriptions
 * - Create atomic strategic tasks with clear intents
 * - No technical implementation details in the plan
 * - Think in terms of user mental models
 */
export class TaskPlannerAgent implements ITaskPlanner {
  public readonly name = 'TaskPlanner';
  public readonly model: string;
  public readonly maxRetries: number;
  
  private llm: LLM;
  constructor(llm: LLM, config: PlannerConfig) {
    this.llm = llm;
    this.model = config.model;
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * Execute planning for a new user goal
   */
  async execute(input: PlannerInput): Promise<PlannerOutput> {
    if (!this.validateInput(input)) {
      throw new Error('Invalid planner input provided');
    }

    const systemMessage = new SystemMessage({ content: TASK_PLANNER_PROMPT });
    
    // MODIFIED: Include screenshots in prompt if available
    const userPrompt = this.buildUserPrompt(input);
    const messages = [systemMessage];
    
    // NEW: Add screenshot if provided
    if (input.currentState?.screenshot) {
      messages.push(new HumanMessage({
        content: [
          { type: 'text', text: userPrompt },
          { 
            type: 'image_url', 
            image_url: { 
              url: input.currentState.pristineScreenshot || input.currentState.screenshot,
              detail: 'high' 
            } 
          }
        ]
      }));
    } else {
      messages.push(new HumanMessage({ content: userPrompt }));
    }
    
    const parser = new JsonOutputParser<{ strategy: any[] }>();
    const response = await this.llm.invokeAndParse(messages, parser);
    
    console.log('[TaskPlanner] Raw LLM response:', JSON.stringify(response, null, 2));
    
    const strategicTasks = this.parseStrategicTasks(response.strategy);
    console.log('[TaskPlanner] Parsed strategic tasks:', JSON.stringify(strategicTasks, null, 2));
    
    const output: PlannerOutput = {
      id: this.generateId(),
      goal: input.goal,
      strategy: strategicTasks,
      createdAt: new Date(),
      currentStepIndex: 0
    };

    if (!this.validateOutput(output)) {
      throw new Error('Generated invalid planner output');
    }

    return output;
  }

  /**
   * Replan when a strategic step fails - create new plan from current state
   */
  async replan(context: ReplanContext): Promise<PlannerOutput> {
    const systemMessage = new SystemMessage({ content: TASK_PLANNER_PROMPT });
    
    const replanPrompt = this.buildReplanPrompt(context);
    const humanMessage = new HumanMessage({ content: replanPrompt });
    
    const parser = new JsonOutputParser<{ strategy: any[] }>();
    const response = await this.llm.invokeAndParse([systemMessage, humanMessage], parser);
    
    const strategicTasks = this.parseStrategicTasks(response.strategy);
    
    return {
      id: this.generateId(),
      goal: context.originalGoal,
      strategy: strategicTasks,
      createdAt: new Date(),
      currentStepIndex: 0
    };
  }

  validateInput(input: PlannerInput): boolean {
    return !!(
      input &&
      typeof input.goal === 'string' &&
      input.goal.trim().length > 0 &&
      typeof input.currentUrl === 'string' &&
      Array.isArray(input.constraints)
    );
  }

  validateOutput(output: PlannerOutput): boolean {
    return !!(
      output &&
      typeof output.id === 'string' &&
      typeof output.goal === 'string' &&
      Array.isArray(output.strategy) &&
      output.strategy.length >= 1 &&
      output.strategy.length <= 7 &&
      output.strategy.every(this.validateStrategicTask) &&
      output.createdAt instanceof Date &&
      typeof output.currentStepIndex === 'number'
    );
  }

  private buildUserPrompt(input: PlannerInput): string {
    const hasVisualContext = input.currentState?.screenshot;
    const pageContextInfo = input.currentState ? `
Current Page Context:
- Page Sections: ${input.currentState.visibleSections.join(', ')}
- Available Actions: ${input.currentState.availableActions.join(', ')}` : '';
    
    return `
PLANNING REQUEST:

User Goal: ${input.goal}
Current Page URL: ${input.currentUrl}
${input.constraints.length > 0 ? `Constraints: ${input.constraints.join(', ')}` : ''}
${pageContextInfo}
${hasVisualContext ? '\nVISUAL CONTEXT: A screenshot of the current page is included to help understand the page layout and available elements.' : ''}

Create a strategic plan with a reasonable number of high-level steps that a human user would take to accomplish this goal.
Remember: Think like a user, not a programmer. Use natural language and focus on intent.
${hasVisualContext ? 'Use the visual context to understand what\'s actually available on the page.' : ''}

Your response must be valid JSON in the format specified in the system prompt.
    `;
  }

  private buildReplanPrompt(context: ReplanContext): string {
    const completedStepsText = context.completedSteps.length > 0 
      ? context.completedSteps.map(step => `✅ ${step.description}`).join('\n')
      : 'None completed yet';

    const failedApproachesText = context.failedApproaches && context.failedApproaches.length > 0
      ? context.failedApproaches.map((approach, i) => `❌ ${i + 1}. ${approach}`).join('\n')
      : 'No previous failed approaches recorded';

    const accumulatedDataText = context.accumulatedData && Object.keys(context.accumulatedData).length > 0
      ? Object.entries(context.accumulatedData).map(([key, value]) => `  - ${key}: ${value}`).join('\n')
      : 'No data extracted yet';

    const memoryLearningsText = context.memoryLearnings || 'No previous learnings for this context.';

    return `
REPLANNING REQUEST:

Original Goal: ${context.originalGoal}

CURRENT SITUATION:
- Failed Step: ${context.failedStep.description}
- Failure Reason: ${context.failureReason}
- Current Page: ${context.currentState.url}
- Page Sections Available: ${context.currentState.visibleSections.join(', ')}
- Available Actions: ${context.currentState.availableActions.join(', ')}
${context.attemptNumber ? `- Attempt Number: ${context.attemptNumber}` : ''}

COMPLETED STEPS (TRY NOT TO REPEAT THESE UNLESS NECESSARY):
${completedStepsText}

ACCUMULATED DATA (PRESERVE THIS INFORMATION):
${accumulatedDataText}

FAILED APPROACHES (DO NOT REPEAT THESE):
${failedApproachesText}

## Learning from Failures

${memoryLearningsText}

When replanning, you MUST:
1. Review the failed approaches list and memory learnings above
2. DO NOT repeat any approach that has already failed
3. Try alternative strategies:
   - Different UI elements or selectors
   - Different navigation paths
   - Different interaction methods
   - Simplified goals if original is unachievable

Based on what has been completed, failed attempts, and memory learnings, create a CONTINUATION plan with only the remaining steps needed to achieve the original goal.
IMPORTANT: 
- Do NOT repeat steps that have already been successfully completed unless absolutely necessary
- Do NOT repeat any approaches that have already failed (check both failed approaches and memory learnings)
- PRESERVE all accumulated data - build upon what has already been extracted
- Start from where we are now, not from the beginning
- The plan should work with the current page state and available functionality
- Learn from the memory learnings to avoid known problematic patterns

Your response must be valid JSON in the format specified in the system prompt.
    `;
  }

  private parseStrategicTasks(strategy: any[]): StrategicTask[] {
    return strategy.map((step, index) => {
      const stepNumber = step.step || (index + 1);
      const description = step.description || `Step ${stepNumber}`;
      
      return {
        id: `task-${this.generateId()}-${index + 1}`,
        name: description,
        description: description,
        intent: step.intent || 'interact',
        targetConcept: step.targetConcept || 'page element',
        inputData: step.inputData,
        expectedOutcome: step.expectedOutcome || step.expectedResult || `Complete step: ${description}`,
        dependencies: [],
        maxAttempts: 3,
        priority: typeof stepNumber === 'number' ? stepNumber : (index + 1)
      };
    });
  }

  private validateStrategicTask(task: StrategicTask): boolean {
    const validIntents = ['search', 'filter', 'navigate', 'extract', 'authenticate', 'verify', 'interact'];
    
    if (!task) {
      console.warn('[TaskPlanner] Validation failed: task is null/undefined');
      return false;
    }
    
    const validations = [
      { check: typeof task.id === 'string', field: 'id', value: task.id },
      { check: typeof task.name === 'string', field: 'name', value: task.name },
      { check: typeof task.description === 'string', field: 'description', value: task.description },
      { check: validIntents.includes(task.intent), field: 'intent', value: task.intent },
      { check: typeof task.targetConcept === 'string', field: 'targetConcept', value: task.targetConcept },
      { check: typeof task.expectedOutcome === 'string', field: 'expectedOutcome', value: task.expectedOutcome },
      { check: Array.isArray(task.dependencies), field: 'dependencies', value: task.dependencies },
      { check: typeof task.maxAttempts === 'number', field: 'maxAttempts', value: task.maxAttempts },
      { check: typeof task.priority === 'number', field: 'priority', value: task.priority }
    ];
    
    for (const validation of validations) {
      if (!validation.check) {
        console.warn(`[TaskPlanner] Validation failed for field '${validation.field}':`, validation.value);
        return false;
      }
    }
    
    return true;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}