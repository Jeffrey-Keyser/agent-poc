import { Result } from '../web/url';

export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date' | 'url' | 'email';

export interface SchemaField {
  name: string;
  type: FieldType;
  required: boolean;
  description?: string;
  selector?: string;
  defaultValue?: any;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    enum?: any[];
  };
  nested?: ExtractionSchemaData;
}

export interface ExtractionSchemaData {
  name: string;
  description?: string;
  fields: SchemaField[];
  version?: string;
  metadata?: Record<string, any>;
}

/**
 * Value object representing a schema for data extraction from web pages
 */
export class ExtractionSchema {
  private constructor(private readonly schema: ExtractionSchemaData) {}

  static create(schema: ExtractionSchemaData): Result<ExtractionSchema> {
    const validation = ExtractionSchema.validateSchema(schema);
    if (!validation.isValid) {
      return Result.fail(validation.errors.join('; '));
    }

    return Result.ok(new ExtractionSchema(schema));
  }

  /**
   * Creates a simple schema for extracting basic data
   */
  static simple(name: string, fields: { name: string; type: FieldType; selector?: string; required?: boolean }[]): Result<ExtractionSchema> {
    const schemaFields: SchemaField[] = fields.map(field => {
      const baseField = {
        name: field.name,
        type: field.type,
        required: field.required ?? false
      };
      
      if (field.selector) {
        return { ...baseField, selector: field.selector };
      }
      
      return baseField;
    });

    return ExtractionSchema.create({
      name,
      fields: schemaFields
    });
  }

  /**
   * Creates a schema for extracting table data
   */
  static table(name: string, columns: { name: string; type: FieldType; selector?: string }[]): Result<ExtractionSchema> {
    const rowSchema: SchemaField[] = columns.map(col => {
      const baseField = {
        name: col.name,
        type: col.type,
        required: false
      };
      
      if (col.selector) {
        return { ...baseField, selector: col.selector };
      }
      
      return baseField;
    });

    return ExtractionSchema.create({
      name,
      fields: [{
        name: 'rows',
        type: 'array',
        required: true,
        nested: {
          name: 'row',
          fields: rowSchema
        }
      }]
    });
  }

  /**
   * Creates a schema for extracting form data
   */
  static form(name: string, formSelector?: string): Result<ExtractionSchema> {
    return ExtractionSchema.create({
      name,
      description: 'Extract form field data',
      fields: [
        {
          name: 'fields',
          type: 'array',
          required: true,
          ...(formSelector && { selector: formSelector }),
          nested: {
            name: 'field',
            fields: [
              { name: 'name', type: 'string', required: true },
              { name: 'type', type: 'string', required: true },
              { name: 'value', type: 'string', required: false },
              { name: 'label', type: 'string', required: false },
              { name: 'placeholder', type: 'string', required: false },
              { name: 'required', type: 'boolean', required: false }
            ]
          }
        }
      ]
    });
  }

  getName(): string {
    return this.schema.name;
  }

  getDescription(): string | undefined {
    return this.schema.description;
  }

  getFields(): ReadonlyArray<SchemaField> {
    return this.schema.fields;
  }

  getVersion(): string | undefined {
    return this.schema.version;
  }

  getMetadata(): Record<string, any> | undefined {
    return this.schema.metadata;
  }

  /**
   * Returns fields that are required
   */
  getRequiredFields(): SchemaField[] {
    return this.schema.fields.filter(field => field.required);
  }

  /**
   * Returns fields that have selectors
   */
  getFieldsWithSelectors(): SchemaField[] {
    return this.schema.fields.filter(field => field.selector);
  }

  /**
   * Returns fields of a specific type
   */
  getFieldsByType(type: FieldType): SchemaField[] {
    return this.schema.fields.filter(field => field.type === type);
  }

  /**
   * Finds a field by name
   */
  getField(name: string): SchemaField | undefined {
    return this.schema.fields.find(field => field.name === name);
  }

  /**
   * Checks if the schema has a specific field
   */
  hasField(name: string): boolean {
    return this.getField(name) !== undefined;
  }

  /**
   * Validates extracted data against this schema
   */
  validate(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    for (const field of this.getRequiredFields()) {
      if (data[field.name] === undefined || data[field.name] === null) {
        errors.push(`Required field '${field.name}' is missing`);
      }
    }

    // Validate field types and constraints
    for (const field of this.schema.fields) {
      const value = data[field.name];
      
      if (value === undefined || value === null) {
        continue; // Skip validation for missing optional fields
      }

      const fieldErrors = this.validateFieldValue(field, value);
      errors.push(...fieldErrors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private validateFieldValue(field: SchemaField, value: any): string[] {
    const errors: string[] = [];

    // Type validation
    if (!this.isValidType(field.type, value)) {
      errors.push(`Field '${field.name}' should be of type ${field.type} but got ${typeof value}`);
      return errors; // Don't continue with other validations if type is wrong
    }

    // Validation rules
    if (field.validation) {
      const validation = field.validation;

      if (field.type === 'string' && typeof value === 'string') {
        if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
          errors.push(`Field '${field.name}' does not match required pattern`);
        }
        if (validation.minLength && value.length < validation.minLength) {
          errors.push(`Field '${field.name}' is too short (minimum ${validation.minLength} characters)`);
        }
        if (validation.maxLength && value.length > validation.maxLength) {
          errors.push(`Field '${field.name}' is too long (maximum ${validation.maxLength} characters)`);
        }
      }

      if (field.type === 'number' && typeof value === 'number') {
        if (validation.min !== undefined && value < validation.min) {
          errors.push(`Field '${field.name}' is too small (minimum ${validation.min})`);
        }
        if (validation.max !== undefined && value > validation.max) {
          errors.push(`Field '${field.name}' is too large (maximum ${validation.max})`);
        }
      }

      if (validation.enum && !validation.enum.includes(value)) {
        errors.push(`Field '${field.name}' must be one of: ${validation.enum.join(', ')}`);
      }
    }

    return errors;
  }

  private isValidType(expectedType: FieldType, value: any): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'date':
        return value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)));
      case 'url':
        if (typeof value !== 'string') return false;
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      case 'email':
        return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      default:
        return true;
    }
  }

  /**
   * Creates a new schema with additional fields
   */
  withAdditionalFields(newFields: SchemaField[]): Result<ExtractionSchema> {
    const updatedSchema: ExtractionSchemaData = {
      ...this.schema,
      fields: [...this.schema.fields, ...newFields]
    };

    return ExtractionSchema.create(updatedSchema);
  }

  /**
   * Creates a new schema without specified fields
   */
  withoutFields(fieldNames: string[]): Result<ExtractionSchema> {
    const updatedSchema: ExtractionSchemaData = {
      ...this.schema,
      fields: this.schema.fields.filter(field => !fieldNames.includes(field.name))
    };

    return ExtractionSchema.create(updatedSchema);
  }

  equals(other: ExtractionSchema): boolean {
    return JSON.stringify(this.schema) === JSON.stringify(other.schema);
  }

  /**
   * Returns the schema as a plain object
   */
  toObject(): ExtractionSchemaData {
    return JSON.parse(JSON.stringify(this.schema));
  }

  /**
   * Returns a JSON string representation
   */
  toJSON(): string {
    return JSON.stringify(this.schema, null, 2);
  }

  /**
   * Creates an ExtractionSchema from a JSON string
   */
  static fromJSON(json: string): Result<ExtractionSchema> {
    try {
      const schema = JSON.parse(json) as ExtractionSchemaData;
      return ExtractionSchema.create(schema);
    } catch (error) {
      return Result.fail(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validates a schema definition
   */
  private static validateSchema(schema: ExtractionSchemaData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!schema.name || schema.name.trim().length === 0) {
      errors.push('Schema name is required');
    }

    if (!schema.fields || !Array.isArray(schema.fields)) {
      errors.push('Schema fields must be an array');
    } else {
      // Validate each field
      for (const field of schema.fields) {
        if (!field.name || field.name.trim().length === 0) {
          errors.push('Field name is required');
        }

        if (!field.type) {
          errors.push(`Field '${field.name}' must have a type`);
        }

        // Check for duplicate field names
        const duplicates = schema.fields.filter(f => f.name === field.name);
        if (duplicates.length > 1) {
          errors.push(`Duplicate field name: '${field.name}'`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Returns a summary of the schema
   */
  getSummary(): {
    name: string;
    totalFields: number;
    requiredFields: number;
    fieldsWithSelectors: number;
    fieldTypes: Record<FieldType, number>;
  } {
    const fieldTypes: Partial<Record<FieldType, number>> = {};
    
    this.schema.fields.forEach(field => {
      fieldTypes[field.type] = (fieldTypes[field.type] || 0) + 1;
    });

    return {
      name: this.schema.name,
      totalFields: this.schema.fields.length,
      requiredFields: this.getRequiredFields().length,
      fieldsWithSelectors: this.getFieldsWithSelectors().length,
      fieldTypes: fieldTypes as Record<FieldType, number>
    };
  }
}