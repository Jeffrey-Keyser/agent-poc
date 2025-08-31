export type VariableParams = {
  name: string;
  value: string;
  isSecret: boolean;
};

/**
 * Immutable value object representing a variable with name, value, and secret flag
 */
export class Variable {
  public readonly name: string;
  public readonly value: string;
  public readonly isSecret: boolean;

  constructor(params: VariableParams) {
    if (!params.name || params.name.trim().length === 0) {
      throw new Error('Variable name cannot be empty');
    }
    
    this.name = params.name;
    this.value = params.value;
    this.isSecret = params.isSecret;
  }

  /**
   * Returns the public representation of the variable value
   * For secret variables, returns the variable name placeholder
   */
  publicValue(): string {
    return this.isSecret ? `{{${this.name}}}` : this.value;
  }

  /**
   * Returns the actual variable value - use with caution for secret variables
   */
  dangerousValue(): string {
    return this.value;
  }

  /**
   * Value object equality comparison
   */
  equals(other: Variable): boolean {
    return (
      this.name === other.name &&
      this.value === other.value &&
      this.isSecret === other.isSecret
    );
  }

  /**
   * Creates a new Variable with the same properties but a different value
   */
  withValue(newValue: string): Variable {
    return new Variable({
      name: this.name,
      value: newValue,
      isSecret: this.isSecret,
    });
  }

  /**
   * Creates a new Variable with the same properties but different secret flag
   */
  withSecretFlag(isSecret: boolean): Variable {
    return new Variable({
      name: this.name,
      value: this.value,
      isSecret,
    });
  }
}