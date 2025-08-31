import { Variable } from './variable';

/**
 * Immutable value object representing a template string with variable interpolation
 */
export class VariableString {
  public readonly template: string;
  public readonly variables: ReadonlyArray<Variable>;

  constructor(
    template: string,
    variables: ReadonlyArray<Variable>
  ) {
    if (template === null || template === undefined) {
      throw new Error('Template cannot be null or undefined');
    }
    
    this.template = template;
    this.variables = variables;
  }

  /**
   * Interpolates the template string with public variable values
   */
  publicValue(): string {
    return this.interpolate(false);
  }

  /**
   * Interpolates the template string with actual variable values (including secrets)
   */
  dangerousValue(): string {
    return this.interpolate(true);
  }

  /**
   * Internal interpolation method
   */
  private interpolate(useDangerousValues: boolean = false): string {
    let interpolatedValue = this.template;

    const variablePattern = /{{(.*?)}}/g;
    interpolatedValue = interpolatedValue.replace(
      variablePattern,
      (_, varName) => {
        const variable = this.variables.find((v) => v.name === varName);
        if (!variable) {
          return `{{${varName}}}`;
        }
        
        return useDangerousValues 
          ? variable.dangerousValue() 
          : variable.publicValue();
      },
    );

    return interpolatedValue;
  }

  /**
   * Value object equality comparison
   */
  equals(other: VariableString): boolean {
    if (this.template !== other.template) {
      return false;
    }

    if (this.variables.length !== other.variables.length) {
      return false;
    }

    return this.variables.every((variable, index) =>
      variable.equals(other.variables[index])
    );
  }

  /**
   * Returns a new VariableString with an additional variable
   */
  withVariable(variable: Variable): VariableString {
    // Remove existing variable with same name if it exists
    const filteredVariables = this.variables.filter(v => v.name !== variable.name);
    return new VariableString(this.template, [...filteredVariables, variable]);
  }

  /**
   * Returns a new VariableString with the specified variable removed
   */
  withoutVariable(variableName: string): VariableString {
    const filteredVariables = this.variables.filter(v => v.name !== variableName);
    return new VariableString(this.template, filteredVariables);
  }

  /**
   * Returns variable names referenced in the template
   */
  getReferencedVariableNames(): string[] {
    const variablePattern = /{{(.*?)}}/g;
    const matches: string[] = [];
    let match;

    while ((match = variablePattern.exec(this.template)) !== null) {
      if (!matches.includes(match[1])) {
        matches.push(match[1]);
      }
    }

    return matches;
  }

  /**
   * Validates that all referenced variables are provided
   */
  isValid(): boolean {
    const referenced = this.getReferencedVariableNames();
    const provided = this.variables.map(v => v.name);
    
    return referenced.every(name => provided.includes(name));
  }
}