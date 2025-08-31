import { Url } from './url';

export interface PageElement {
  selector: string;
  tagName: string;
  text?: string;
  attributes: Record<string, string>;
  visible: boolean;
  clickable: boolean;
}

export interface PageMetadata {
  title: string;
  description?: string;
  keywords?: string[];
  canonical?: string;
  language?: string;
}

/**
 * Immutable value object representing the state of a web page at a point in time
 */
export class PageState {
  private constructor(
    public readonly url: Url,
    public readonly title: string,
    public readonly html: string,
    public readonly timestamp: Date,
    public readonly elements: ReadonlyArray<PageElement>,
    public readonly metadata: PageMetadata,
    public readonly loadTime: number,
    public readonly screenshot?: string // Base64 encoded screenshot
  ) {}

  static create(params: {
    url: Url;
    title: string;
    html: string;
    elements: PageElement[];
    metadata?: Partial<PageMetadata>;
    loadTime: number;
    screenshot?: string;
  }): PageState {
    const metadata: PageMetadata = {
      title: params.title,
      ...(params.metadata?.description && { description: params.metadata.description }),
      ...(params.metadata?.keywords && { keywords: params.metadata.keywords }),
      ...(params.metadata?.canonical && { canonical: params.metadata.canonical }),
      ...(params.metadata?.language && { language: params.metadata.language }),
    };

    return new PageState(
      params.url,
      params.title,
      params.html,
      new Date(),
      params.elements,
      metadata,
      params.loadTime,
      params.screenshot
    );
  }

  /**
   * Returns elements that match the given selector
   */
  findElements(selector: string): PageElement[] {
    return this.elements.filter(element => 
      element.selector === selector || 
      element.selector.includes(selector)
    );
  }

  /**
   * Returns visible elements only
   */
  getVisibleElements(): PageElement[] {
    return this.elements.filter(element => element.visible);
  }

  /**
   * Returns clickable elements only
   */
  getClickableElements(): PageElement[] {
    return this.elements.filter(element => element.clickable);
  }

  /**
   * Returns elements containing the specified text
   */
  findElementsByText(text: string): PageElement[] {
    const searchText = text.toLowerCase();
    return this.elements.filter(element => 
      element.text?.toLowerCase().includes(searchText)
    );
  }

  /**
   * Returns elements of a specific tag type
   */
  getElementsByTagName(tagName: string): PageElement[] {
    return this.elements.filter(element => 
      element.tagName.toLowerCase() === tagName.toLowerCase()
    );
  }

  /**
   * Returns elements with a specific attribute value
   */
  findElementsByAttribute(attributeName: string, attributeValue?: string): PageElement[] {
    return this.elements.filter(element => {
      const value = element.attributes[attributeName];
      if (attributeValue === undefined) {
        return value !== undefined;
      }
      return value === attributeValue;
    });
  }

  /**
   * Checks if the page contains specific text
   */
  containsText(text: string): boolean {
    return this.html.toLowerCase().includes(text.toLowerCase()) ||
           this.elements.some(element => 
             element.text?.toLowerCase().includes(text.toLowerCase())
           );
  }

  /**
   * Checks if the page has loaded completely (heuristic based on load time)
   */
  isFullyLoaded(): boolean {
    return this.loadTime > 0 && this.html.length > 0;
  }

  /**
   * Returns the age of this page state
   */
  getAge(): number {
    return Date.now() - this.timestamp.getTime();
  }

  /**
   * Checks if this page state is fresh (less than specified milliseconds old)
   */
  isFresh(maxAgeMs: number = 5000): boolean {
    return this.getAge() < maxAgeMs;
  }

  /**
   * Returns a summary of the page state
   */
  getSummary(): {
    url: string;
    title: string;
    elementCount: number;
    visibleElementCount: number;
    clickableElementCount: number;
    loadTime: number;
    hasScreenshot: boolean;
    timestamp: Date;
  } {
    return {
      url: this.url.toString(),
      title: this.title,
      elementCount: this.elements.length,
      visibleElementCount: this.getVisibleElements().length,
      clickableElementCount: this.getClickableElements().length,
      loadTime: this.loadTime,
      hasScreenshot: !!this.screenshot,
      timestamp: this.timestamp,
    };
  }

  equals(other: PageState): boolean {
    return (
      this.url.equals(other.url) &&
      this.title === other.title &&
      this.html === other.html &&
      this.timestamp.getTime() === other.timestamp.getTime()
    );
  }

  /**
   * Creates a new PageState with updated elements (useful for dynamic content)
   */
  withUpdatedElements(elements: PageElement[]): PageState {
    return new PageState(
      this.url,
      this.title,
      this.html,
      new Date(), // New timestamp for updated state
      elements,
      this.metadata,
      this.loadTime,
      this.screenshot
    );
  }
}