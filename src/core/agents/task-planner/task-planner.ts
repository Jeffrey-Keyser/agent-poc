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
    
    const strategicTasks = this.parseStrategicTasks(response.strategy);
    
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

    return `
REPLANNING REQUEST:

Original Goal: ${context.originalGoal}

CURRENT SITUATION:
- Failed Step: ${context.failedStep.description}
- Failure Reason: ${context.failureReason}
- Current Page: ${context.currentState.url}
- Page Sections Available: ${context.currentState.visibleSections.join(', ')}
- Available Actions: ${context.currentState.availableActions.join(', ')}

COMPLETED STEPS (DO NOT REPEAT THESE):
${completedStepsText}

Based on what has been completed and the current page state, create a CONTINUATION plan with only the remaining steps needed to achieve the original goal.
Do NOT repeat steps that have already been successfully completed.
Start from where we are now, not from the beginning.
The plan should work with the current page state and available functionality.

Your response must be valid JSON in the format specified in the system prompt.
    `;
  }

  private parseStrategicTasks(strategy: any[]): StrategicTask[] {
    return strategy.map((step, index) => ({
      id: `task-${this.generateId()}-${index + 1}`,
      name: step.description || `Step ${step.step}`,
      description: step.description || '',
      intent: step.intent || 'interact',
      targetConcept: step.targetConcept || 'page element',
      inputData: step.inputData,
      expectedOutcome: step.expectedResult || step.expectedOutcome || '',
      dependencies: [],
      maxAttempts: 3,
      priority: step.step || index + 1
    }));
  }

  private validateStrategicTask(task: StrategicTask): boolean {
    const validIntents = ['search', 'filter', 'navigate', 'extract', 'authenticate', 'verify', 'interact'];
    return !!(
      task &&
      typeof task.id === 'string' &&
      typeof task.name === 'string' &&
      typeof task.description === 'string' &&
      validIntents.includes(task.intent) &&
      typeof task.targetConcept === 'string' &&
      typeof task.expectedOutcome === 'string' &&
      Array.isArray(task.dependencies) &&
      typeof task.maxAttempts === 'number' &&
      typeof task.priority === 'number'
    );
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}