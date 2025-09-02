import { Variable } from '../../value-objects/variable';

describe('Variable Value Object', () => {
  describe('construction', () => {
    it('should create a valid Variable with all properties', () => {
      const variable = new Variable({
        name: 'test_var',
        value: 'test_value',
        isSecret: false
      });

      expect(variable.name).toBe('test_var');
      expect(variable.value).toBe('test_value');
      expect(variable.isSecret).toBe(false);
    });

    it('should throw error for empty name', () => {
      expect(() => {
        new Variable({
          name: '',
          value: 'test',
          isSecret: false
        });
      }).toThrow('Variable name cannot be empty');
    });

    it('should throw error for whitespace-only name', () => {
      expect(() => {
        new Variable({
          name: '   ',
          value: 'test',
          isSecret: false
        });
      }).toThrow('Variable name cannot be empty');
    });
  });

  describe('publicValue', () => {
    it('should return actual value for non-secret variables', () => {
      const variable = new Variable({
        name: 'test_var',
        value: 'actual_value',
        isSecret: false
      });

      expect(variable.publicValue()).toBe('actual_value');
    });

    it('should return placeholder for secret variables', () => {
      const variable = new Variable({
        name: 'secret_var',
        value: 'secret_value',
        isSecret: true
      });

      expect(variable.publicValue()).toBe('{{secret_var}}');
    });
  });

  describe('dangerousValue', () => {
    it('should always return actual value regardless of secret flag', () => {
      const secretVar = new Variable({
        name: 'secret',
        value: 'secret_value',
        isSecret: true
      });
      
      const publicVar = new Variable({
        name: 'public',
        value: 'public_value',
        isSecret: false
      });

      expect(secretVar.dangerousValue()).toBe('secret_value');
      expect(publicVar.dangerousValue()).toBe('public_value');
    });
  });

  describe('equals', () => {
    it('should return true for identical variables', () => {
      const var1 = new Variable({
        name: 'test',
        value: 'value',
        isSecret: false
      });
      
      const var2 = new Variable({
        name: 'test',
        value: 'value',
        isSecret: false
      });

      expect(var1.equals(var2)).toBe(true);
    });

    it('should return false for different variables', () => {
      const var1 = new Variable({
        name: 'test1',
        value: 'value',
        isSecret: false
      });
      
      const var2 = new Variable({
        name: 'test2',
        value: 'value',
        isSecret: false
      });

      expect(var1.equals(var2)).toBe(false);
    });
  });

  describe('withValue', () => {
    it('should create new Variable with updated value', () => {
      const original = new Variable({
        name: 'test',
        value: 'original',
        isSecret: true
      });
      
      const updated = original.withValue('updated');

      expect(updated.name).toBe('test');
      expect(updated.value).toBe('updated');
      expect(updated.isSecret).toBe(true);
      expect(original.value).toBe('original'); // Original unchanged
    });
  });

  describe('withSecretFlag', () => {
    it('should create new Variable with updated secret flag', () => {
      const original = new Variable({
        name: 'test',
        value: 'value',
        isSecret: false
      });
      
      const updated = original.withSecretFlag(true);

      expect(updated.name).toBe('test');
      expect(updated.value).toBe('value');
      expect(updated.isSecret).toBe(true);
      expect(original.isSecret).toBe(false); // Original unchanged
    });
  });
});