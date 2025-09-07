import { Result } from '../web/url';

export type EvidenceType = 'screenshot' | 'html' | 'text' | 'element' | 'network' | 'console' | 'error' | 'execution-log' | 'extracted-data';

export interface EvidenceMetadata {
  timestamp: Date;
  source: string;
  description?: string;
  confidence?: number;
}

/**
 * Value object representing evidence of task completion or failure
 */
export class Evidence {
  private constructor(
    public readonly type: EvidenceType,
    public readonly data: string,
    public readonly metadata: EvidenceMetadata
  ) {}

  static create(
    type: EvidenceType,
    data: string,
    metadata: Partial<EvidenceMetadata> & { source: string }
  ): Result<Evidence> {
    if (!data || data.trim().length === 0) {
      return Result.fail('Evidence data cannot be empty');
    }

    if (!metadata.source || metadata.source.trim().length === 0) {
      return Result.fail('Evidence source cannot be empty');
    }

    const fullMetadata: EvidenceMetadata = {
      timestamp: metadata.timestamp || new Date(),
      source: metadata.source,
      ...(metadata.description && { description: metadata.description }),
      ...(metadata.confidence && { confidence: metadata.confidence })
    };

    return Result.ok(new Evidence(type, data, fullMetadata));
  }

  /**
   * Factory methods for different evidence types
   */
  static screenshot(base64Data: string, source: string, description?: string): Result<Evidence> {
    return Evidence.create('screenshot', base64Data, {
      source,
      description: description || 'Page screenshot'
    });
  }

  static html(htmlContent: string, source: string, description?: string): Result<Evidence> {
    return Evidence.create('html', htmlContent, {
      source,
      description: description || 'Page HTML content'
    });
  }

  static text(textContent: string, source: string, description?: string): Result<Evidence> {
    return Evidence.create('text', textContent, {
      source,
      description: description || 'Extracted text'
    });
  }

  static element(elementData: string, source: string, description?: string): Result<Evidence> {
    return Evidence.create('element', elementData, {
      source,
      description: description || 'Element information'
    });
  }

  static network(networkData: string, source: string, description?: string): Result<Evidence> {
    return Evidence.create('network', networkData, {
      source,
      description: description || 'Network activity'
    });
  }

  static console(consoleData: string, source: string, description?: string): Result<Evidence> {
    return Evidence.create('console', consoleData, {
      source,
      description: description || 'Console output'
    });
  }

  static error(errorData: string, source: string, description?: string): Result<Evidence> {
    return Evidence.create('error', errorData, {
      source,
      description: description || 'Error information'
    });
  }

  toString(): string {
    return `${this.type}:${this.metadata.source}:${this.getDataPreview()}`;
  }

  equals(other: Evidence): boolean {
    return (
      this.type === other.type &&
      this.data === other.data &&
      this.metadata.source === other.metadata.source &&
      this.metadata.timestamp.getTime() === other.metadata.timestamp.getTime()
    );
  }

  /**
   * Returns a preview of the evidence data (truncated for display)
   */
  getDataPreview(maxLength: number = 100): string {
    if (this.data.length <= maxLength) {
      return this.data;
    }

    return this.data.substring(0, maxLength - 3) + '...';
  }

  /**
   * Returns the full evidence data
   */
  getData(): string {
    return this.data;
  }

  /**
   * Returns the evidence value (alias for getData for compatibility)
   */
  getValue(): string {
    return this.data;
  }

  /**
   * Returns the evidence type
   */
  getType(): EvidenceType {
    return this.type;
  }

  /**
   * Returns the size of the evidence data
   */
  getDataSize(): number {
    return this.data.length;
  }

  /**
   * Checks if this evidence is fresh (created recently)
   */
  isFresh(maxAgeMs: number = 30000): boolean {
    const age = Date.now() - this.metadata.timestamp.getTime();
    return age <= maxAgeMs;
  }

  /**
   * Returns the age of this evidence in milliseconds
   */
  getAge(): number {
    return Date.now() - this.metadata.timestamp.getTime();
  }

  /**
   * Checks if this evidence is of a visual type (screenshot)
   */
  isVisual(): boolean {
    return this.type === 'screenshot';
  }

  /**
   * Checks if this evidence is textual
   */
  isTextual(): boolean {
    return ['text', 'html', 'console', 'error'].includes(this.type);
  }

  /**
   * Checks if this evidence indicates an error or problem
   */
  isErrorEvidence(): boolean {
    return this.type === 'error';
  }

  /**
   * Checks if this evidence has a confidence score
   */
  hasConfidence(): boolean {
    return this.metadata.confidence !== undefined;
  }

  /**
   * Returns the confidence score if available
   */
  getConfidence(): number | undefined {
    return this.metadata.confidence;
  }

  /**
   * Creates a new evidence with updated confidence
   */
  withConfidence(confidence: number): Result<Evidence> {
    if (confidence < 0 || confidence > 100) {
      return Result.fail('Confidence must be between 0 and 100');
    }

    return Evidence.create(this.type, this.data, {
      ...this.metadata,
      confidence
    });
  }

  /**
   * Creates a new evidence with additional description
   */
  withDescription(description: string): Result<Evidence> {
    return Evidence.create(this.type, this.data, {
      ...this.metadata,
      description
    });
  }

  /**
   * Validates the evidence data based on its type
   */
  isValid(): boolean {
    switch (this.type) {
      case 'screenshot':
        // Basic base64 validation
        return this.data.startsWith('data:image/') || /^[A-Za-z0-9+/=]+$/.test(this.data);
      case 'html':
        // Basic HTML validation
        return this.data.includes('<') && this.data.includes('>');
      case 'text':
        return this.data.trim().length > 0;
      case 'element':
        // Should contain element information (JSON or structured data)
        try {
          JSON.parse(this.data);
          return true;
        } catch {
          return this.data.trim().length > 0;
        }
      case 'network':
      case 'console':
      case 'error':
        return this.data.trim().length > 0;
      default:
        return true;
    }
  }

  /**
   * Returns a summary object for logging or debugging
   */
  getSummary(): {
    type: EvidenceType;
    source: string;
    timestamp: Date;
    dataSize: number;
    hasConfidence: boolean;
    confidence?: number;
    description?: string;
    isValid: boolean;
  } {
    const summary: any = {
      type: this.type,
      source: this.metadata.source,
      timestamp: this.metadata.timestamp,
      dataSize: this.getDataSize(),
      hasConfidence: this.hasConfidence(),
      isValid: this.isValid()
    };

    if (this.getConfidence() !== undefined) {
      summary.confidence = this.getConfidence();
    }

    if (this.metadata.description) {
      summary.description = this.metadata.description;
    }

    return summary;
  }

  /**
   * Combines multiple pieces of evidence into a collection
   */
  static combine(evidences: Evidence[]): EvidenceCollection {
    return new EvidenceCollection(evidences);
  }
}

/**
 * Collection of evidence pieces
 */
export class EvidenceCollection {
  constructor(private readonly evidences: ReadonlyArray<Evidence>) {}

  getAll(): ReadonlyArray<Evidence> {
    return this.evidences;
  }

  getByType(type: EvidenceType): Evidence[] {
    return this.evidences.filter(e => e.type === type);
  }

  getBySource(source: string): Evidence[] {
    return this.evidences.filter(e => e.metadata.source === source);
  }

  getLatest(): Evidence | undefined {
    if (this.evidences.length === 0) return undefined;
    
    return this.evidences.reduce((latest, current) =>
      current.metadata.timestamp > latest.metadata.timestamp ? current : latest
    );
  }

  hasVisualEvidence(): boolean {
    return this.evidences.some(e => e.isVisual());
  }

  hasErrorEvidence(): boolean {
    return this.evidences.some(e => e.isErrorEvidence());
  }

  getErrorEvidence(): Evidence[] {
    return this.evidences.filter(e => e.isErrorEvidence());
  }

  size(): number {
    return this.evidences.length;
  }

  isEmpty(): boolean {
    return this.evidences.length === 0;
  }

  /**
   * Returns evidence sorted by timestamp (newest first)
   */
  sortedByTime(): Evidence[] {
    return [...this.evidences].sort((a, b) => 
      b.metadata.timestamp.getTime() - a.metadata.timestamp.getTime()
    );
  }

  /**
   * Filters evidence by freshness
   */
  getFreshEvidence(maxAgeMs: number = 30000): Evidence[] {
    return this.evidences.filter(e => e.isFresh(maxAgeMs));
  }

  /**
   * Returns a summary of the evidence collection
   */
  getSummary(): {
    totalCount: number;
    byType: Record<EvidenceType, number>;
    hasErrors: boolean;
    hasVisual: boolean;
    latestTimestamp?: Date;
  } {
    const byType: Partial<Record<EvidenceType, number>> = {};
    
    this.evidences.forEach(e => {
      byType[e.type] = (byType[e.type] || 0) + 1;
    });

    const latest = this.getLatest();
    const summary: any = {
      totalCount: this.evidences.length,
      byType: byType as Record<EvidenceType, number>,
      hasErrors: this.hasErrorEvidence(),
      hasVisual: this.hasVisualEvidence()
    };

    if (latest) {
      summary.latestTimestamp = latest.metadata.timestamp;
    }

    return summary;
  }
}