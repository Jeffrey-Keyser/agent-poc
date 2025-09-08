import { Variable } from '../value-objects/variable';

export class VariableManager {
  private variables: Map<string, Variable> = new Map();

  constructor(variables: Variable[] = []) {
    variables.forEach(v => this.variables.set(v.name, v));
  }

  /**
   * Interpolate variables in a string, replacing {{variable_name}} with values
   */
  interpolate(text: string): string {
    let result = text;
    
    for (const [name, variable] of this.variables.entries()) {
      const pattern = new RegExp(`{{${name}}}`, 'g');
      result = result.replace(pattern, variable.dangerousValue());
    }
    
    return result;
  }

  /**
   * Add or update a variable
   */
  setVariable(variable: Variable): void {
    this.variables.set(variable.name, variable);
  }

  /**
   * Get a variable by name
   */
  getVariable(name: string): Variable | undefined {
    return this.variables.get(name);
  }

  /**
   * Get all variables
   */
  getVariables(): Map<string, Variable> {
    return this.variables;
  }

  /**
   * Check if text contains any secret variables
   */
  containsSecrets(text: string): boolean {
    for (const [name, variable] of this.variables.entries()) {
      if (variable.isSecret && text.includes(`{{${name}}}`)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all variable names
   */
  getVariableNames(): string[] {
    return Array.from(this.variables.keys());
  }

  /**
   * Check if a variable exists
   */
  hasVariable(name: string): boolean {
    return this.variables.has(name);
  }

  /**
   * Remove a variable
   */
  removeVariable(name: string): boolean {
    return this.variables.delete(name);
  }

  /**
   * Clear all variables
   */
  clear(): void {
    this.variables.clear();
  }

  /**
   * Get count of variables
   */
  size(): number {
    return this.variables.size;
  }
}