import { VariableString } from '../../value-objects/variable-string';
import { Variable } from '../../value-objects/variable';

describe('VariableString Value Object', () => {
  const testVariables = [
    new Variable({ name: 'name', value: 'John', isSecret: false }),
    new Variable({ name: 'secret', value: 'password123', isSecret: true }),
    new Variable({ name: 'age', value: '25', isSecret: false })
  ];

  describe('construction', () => {
    it('should create a valid VariableString', () => {
      const template = 'Hello {{name}}, you are {{age}} years old';
      const varString = new VariableString(template, testVariables);

      expect(varString.template).toBe(template);
      expect(varString.variables).toEqual(testVariables);
    });

    it('should throw error for null template', () => {
      expect(() => {
        new VariableString(null as any, []);
      }).toThrow('Template cannot be null or undefined');
    });

    it('should throw error for undefined template', () => {
      expect(() => {
        new VariableString(undefined as any, []);
      }).toThrow('Template cannot be null or undefined');
    });

    it('should accept empty template', () => {
      const varString = new VariableString('', []);
      expect(varString.template).toBe('');
    });
  });

  describe('publicValue', () => {
    it('should interpolate non-secret variables with actual values', () => {
      const template = 'Hello {{name}}, you are {{age}} years old';
      const varString = new VariableString(template, testVariables);

      const result = varString.publicValue();
      expect(result).toBe('Hello John, you are 25 years old');
    });

    it('should show placeholders for secret variables', () => {
      const template = 'Username: {{name}}, Password: {{secret}}';
      const varString = new VariableString(template, testVariables);

      const result = varString.publicValue();
      expect(result).toBe('Username: John, Password: {{secret}}');
    });

    it('should leave unknown variables as placeholders', () => {
      const template = 'Hello {{name}}, your email is {{email}}';
      const varString = new VariableString(template, testVariables);

      const result = varString.publicValue();
      expect(result).toBe('Hello John, your email is {{email}}');
    });
  });

  describe('dangerousValue', () => {
    it('should interpolate all variables with actual values', () => {
      const template = 'Username: {{name}}, Password: {{secret}}';
      const varString = new VariableString(template, testVariables);

      const result = varString.dangerousValue();
      expect(result).toBe('Username: John, Password: password123');
    });

    it('should leave unknown variables as placeholders', () => {
      const template = 'Hello {{name}}, your token is {{token}}';
      const varString = new VariableString(template, testVariables);

      const result = varString.dangerousValue();
      expect(result).toBe('Hello John, your token is {{token}}');
    });
  });

  describe('equals', () => {
    it('should return true for identical VariableStrings', () => {
      const template = 'Hello {{name}}';
      const vars1 = [new Variable({ name: 'name', value: 'John', isSecret: false })];
      const vars2 = [new Variable({ name: 'name', value: 'John', isSecret: false })];

      const varString1 = new VariableString(template, vars1);
      const varString2 = new VariableString(template, vars2);

      expect(varString1.equals(varString2)).toBe(true);
    });

    it('should return false for different templates', () => {
      const vars = [new Variable({ name: 'name', value: 'John', isSecret: false })];
      const varString1 = new VariableString('Hello {{name}}', vars);
      const varString2 = new VariableString('Hi {{name}}', vars);

      expect(varString1.equals(varString2)).toBe(false);
    });

    it('should return false for different variables', () => {
      const template = 'Hello {{name}}';
      const vars1 = [new Variable({ name: 'name', value: 'John', isSecret: false })];
      const vars2 = [new Variable({ name: 'name', value: 'Jane', isSecret: false })];

      const varString1 = new VariableString(template, vars1);
      const varString2 = new VariableString(template, vars2);

      expect(varString1.equals(varString2)).toBe(false);
    });
  });

  describe('withVariable', () => {
    it('should add a new variable', () => {
      const template = 'Hello {{name}} {{surname}}';
      const vars = [new Variable({ name: 'name', value: 'John', isSecret: false })];
      const varString = new VariableString(template, vars);

      const newVar = new Variable({ name: 'surname', value: 'Doe', isSecret: false });
      const updated = varString.withVariable(newVar);

      expect(updated.variables).toHaveLength(2);
      expect(updated.publicValue()).toBe('Hello John Doe');
    });

    it('should replace existing variable with same name', () => {
      const template = 'Hello {{name}}';
      const vars = [new Variable({ name: 'name', value: 'John', isSecret: false })];
      const varString = new VariableString(template, vars);

      const newVar = new Variable({ name: 'name', value: 'Jane', isSecret: false });
      const updated = varString.withVariable(newVar);

      expect(updated.variables).toHaveLength(1);
      expect(updated.publicValue()).toBe('Hello Jane');
    });
  });

  describe('withoutVariable', () => {
    it('should remove specified variable', () => {
      const template = 'Hello {{name}} {{age}}';
      const varString = new VariableString(template, testVariables);

      const updated = varString.withoutVariable('age');
      const remainingNames = updated.variables.map(v => v.name);

      expect(remainingNames).not.toContain('age');
      expect(remainingNames).toContain('name');
      expect(updated.publicValue()).toBe('Hello John {{age}}');
    });
  });

  describe('getReferencedVariableNames', () => {
    it('should return all variable names referenced in template', () => {
      const template = 'Hello {{name}}, you are {{age}} years old, password: {{secret}}';
      const varString = new VariableString(template, []);

      const names = varString.getReferencedVariableNames();
      expect(names).toContain('name');
      expect(names).toContain('age');
      expect(names).toContain('secret');
      expect(names).toHaveLength(3);
    });

    it('should not duplicate variable names', () => {
      const template = 'Hello {{name}}, {{name}} is your name';
      const varString = new VariableString(template, []);

      const names = varString.getReferencedVariableNames();
      expect(names).toEqual(['name']);
    });
  });

  describe('isValid', () => {
    it('should return true when all referenced variables are provided', () => {
      const template = 'Hello {{name}}, you are {{age}}';
      const vars = [
        new Variable({ name: 'name', value: 'John', isSecret: false }),
        new Variable({ name: 'age', value: '25', isSecret: false })
      ];
      const varString = new VariableString(template, vars);

      expect(varString.isValid()).toBe(true);
    });

    it('should return false when some referenced variables are missing', () => {
      const template = 'Hello {{name}}, you are {{age}} years old';
      const vars = [new Variable({ name: 'name', value: 'John', isSecret: false })];
      const varString = new VariableString(template, vars);

      expect(varString.isValid()).toBe(false);
    });

    it('should return true for template with no variables', () => {
      const template = 'Hello world';
      const varString = new VariableString(template, []);

      expect(varString.isValid()).toBe(true);
    });
  });
});