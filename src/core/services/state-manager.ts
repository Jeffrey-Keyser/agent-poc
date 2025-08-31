import { PageState } from '../types/agent-types';
import { Browser } from '../interfaces/browser.interface';
import { DomService } from '@/infra/services/dom-service';
import { truncateForLogging } from '../shared/utils';

export class StateManager {
  private stateHistory: PageState[] = [];
  private currentState: PageState | null = null;
  private extractedData: Map<string, any> = new Map();
  private persistentData: Map<string, any> = new Map();
  private checkpoints: Map<string, PageState> = new Map();

  constructor(
    private browser: Browser,
    private domService: DomService
  ) {}

  async captureState(): Promise<PageState> {
    const domState = await this.domService.getInteractiveElements();
    
    const state: PageState = {
      url: this.browser.getPageUrl(),
      title: await this.browser.getTitle(),
      visibleSections: await this.identifyPageSectionsFromDomState(domState),
      availableActions: await this.identifyPossibleActionsFromDomState(domState),
      extractedData: Object.fromEntries(this.extractedData),
      screenshot: domState.screenshot,
      pristineScreenshot: domState.pristineScreenshot,
      pixelAbove: domState.pixelAbove,
      pixelBelow: domState.pixelBelow
    };

    this.stateHistory.push(state);
    this.currentState = state;
    return state;
  }

  async identifyPageSections(): Promise<string[]> {
    // Semantic identification of page sections
    const elements = await this.domService.getInteractiveElements();
    return this.identifyPageSectionsFromDomState(elements);
  }

  async identifyPageSectionsFromDomState(domState: any): Promise<string[]> {
    const sections = new Set<string>();

    // Look for common patterns
    if (this.hasSearchElements(domState)) sections.add('search functionality');
    if (this.hasFilterElements(domState)) sections.add('filtering options');
    if (this.hasResultsGrid(domState)) sections.add('results display');
    if (this.hasLoginElements(domState)) sections.add('authentication section');
    if (this.hasNavigationMenu(domState)) sections.add('navigation menu');
    if (this.hasShoppingCart(domState)) sections.add('shopping cart');
    if (this.hasProductDetails(domState)) sections.add('product details');
    if (this.hasCheckoutFlow(domState)) sections.add('checkout process');
    if (this.hasUserProfile(domState)) sections.add('user profile');

    return Array.from(sections);
  }

  async identifyPossibleActions(): Promise<string[]> {
    const elements = await this.domService.getInteractiveElements();
    return this.identifyPossibleActionsFromDomState(elements);
  }

  async identifyPossibleActionsFromDomState(domState: any): Promise<string[]> {
    const actions = new Set<string>();

    // Identify what user can do on current page
    if (this.canSearch(domState)) actions.add('search for products');
    if (this.canFilter(domState)) actions.add('apply filters');
    if (this.canSort(domState)) actions.add('sort results');
    if (this.canNavigate(domState)) actions.add('navigate to other pages');
    if (this.canAddToCart(domState)) actions.add('add items to cart');
    if (this.canLogin(domState)) actions.add('login to account');
    if (this.canCheckout(domState)) actions.add('proceed to checkout');
    if (this.canViewDetails(domState)) actions.add('view product details');
    if (this.canCompare(domState)) actions.add('compare products');

    return Array.from(actions);
  }

  hasStateChanged(previous: PageState, current: PageState): boolean {
    // Semantic comparison, not exact DOM matching
    if (previous.url !== current.url) return true;

    // Check if major sections changed
    const prevSections = new Set(previous.visibleSections);
    const currSections = new Set(current.visibleSections);

    if (prevSections.size !== currSections.size) return true;

    for (const section of currSections) {
      if (!prevSections.has(section)) return true;
    }

    // Check if available actions changed significantly
    const prevActions = new Set(previous.availableActions);
    const currActions = new Set(current.availableActions);

    const actionChanges = this.calculateSetDifference(prevActions, currActions);
    return actionChanges > 0.3; // 30% change threshold
  }

  private calculateSetDifference(set1: Set<string>, set2: Set<string>): number {
    const union = new Set([...set1, ...set2]);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    
    if (union.size === 0) return 0;
    return 1 - (intersection.size / union.size);
  }

  // Search functionality detection
  private hasSearchElements(domState: any): boolean {
    // Work with both domState object or elements array for backward compatibility
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    return elements.some((el: any) => 
      el.type === 'input' && 
      (el.placeholder?.toLowerCase().includes('search') ||
       el.name?.toLowerCase().includes('search') ||
       el.id?.toLowerCase().includes('search'))
    );
  }

  // Helper method to extract elements from domState for backward compatibility
  private extractElementsFromDomState(domState: any): any[] {
    if (!domState || !domState.selectorMap) return [];
    return Object.values(domState.selectorMap);
  }

  // Filter detection
  private hasFilterElements(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    return elements.some((el: any) =>
      el.type === 'select' ||
      (el.type === 'input' && el.inputType === 'checkbox') ||
      (el.text && el.text.toLowerCase().includes('filter'))
    );
  }

  // Results grid detection
  private hasResultsGrid(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    const productIndicators = ['product', 'item', 'result', 'listing'];
    return elements.some((el: any) =>
      productIndicators.some(indicator =>
        el.className?.toLowerCase().includes(indicator) ||
        el.id?.toLowerCase().includes(indicator)
      )
    );
  }

  // Login form detection
  private hasLoginElements(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    const hasEmailInput = elements.some((el: any) =>
      el.type === 'input' && 
      (el.inputType === 'email' || 
       el.name?.toLowerCase().includes('email') ||
       el.name?.toLowerCase().includes('username'))
    );
    
    const hasPasswordInput = elements.some((el: any) =>
      el.type === 'input' && el.inputType === 'password'
    );

    return hasEmailInput && hasPasswordInput;
  }

  // Navigation menu detection
  private hasNavigationMenu(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    const navIndicators = ['nav', 'menu', 'header'];
    return elements.some((el: any) =>
      navIndicators.some(indicator =>
        el.tagName?.toLowerCase().includes(indicator) ||
        el.role?.toLowerCase().includes(indicator)
      )
    );
  }

  // Shopping cart detection
  private hasShoppingCart(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    const cartIndicators = ['cart', 'basket', 'bag'];
    return elements.some((el: any) =>
      cartIndicators.some(indicator =>
        el.text?.toLowerCase().includes(indicator) ||
        el.ariaLabel?.toLowerCase().includes(indicator)
      )
    );
  }

  // Product details detection
  private hasProductDetails(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    const detailIndicators = ['price', 'description', 'specifications', 'reviews'];
    return detailIndicators.filter(indicator =>
      elements.some((el: any) =>
        el.text?.toLowerCase().includes(indicator) ||
        el.className?.toLowerCase().includes(indicator)
      )
    ).length >= 2; // At least 2 indicators present
  }

  // Checkout flow detection
  private hasCheckoutFlow(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    const checkoutIndicators = ['checkout', 'payment', 'billing', 'shipping'];
    return elements.some((el: any) =>
      checkoutIndicators.some(indicator =>
        el.text?.toLowerCase().includes(indicator) ||
        el.id?.toLowerCase().includes(indicator)
      )
    );
  }

  // User profile detection
  private hasUserProfile(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    const profileIndicators = ['profile', 'account', 'settings'];
    return elements.some((el: any) =>
      profileIndicators.some(indicator =>
        el.text?.toLowerCase().includes(indicator) ||
        el.href?.toLowerCase().includes(indicator)
      )
    );
  }

  // Action capability detection methods
  private canSearch(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    return this.hasSearchElements(domState) && 
           elements.some((el: any) => el.type === 'button' || el.type === 'submit');
  }

  private canFilter(domState: any): boolean {
    return this.hasFilterElements(domState);
  }

  private canSort(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    const sortIndicators = ['sort', 'order by'];
    return elements.some((el: any) =>
      sortIndicators.some(indicator =>
        el.text?.toLowerCase().includes(indicator) ||
        el.ariaLabel?.toLowerCase().includes(indicator)
      )
    );
  }

  private canNavigate(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    return elements.some((el: any) => el.type === 'link' || el.tagName === 'a');
  }

  private canAddToCart(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    const addToCartIndicators = ['add to cart', 'add to bag', 'buy now'];
    return elements.some((el: any) =>
      addToCartIndicators.some(indicator =>
        el.text?.toLowerCase().includes(indicator)
      )
    );
  }

  private canLogin(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    return this.hasLoginElements(domState) &&
           elements.some((el: any) => 
             el.type === 'button' && 
             (el.text?.toLowerCase().includes('login') || 
              el.text?.toLowerCase().includes('sign in'))
           );
  }

  private canCheckout(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    return this.hasCheckoutFlow(domState) ||
           elements.some((el: any) =>
             el.text?.toLowerCase().includes('checkout') ||
             el.text?.toLowerCase().includes('proceed to')
           );
  }

  private canViewDetails(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    return elements.some((el: any) =>
      el.text?.toLowerCase().includes('view details') ||
      el.text?.toLowerCase().includes('more info')
    );
  }

  private canCompare(domState: any): boolean {
    const elements = Array.isArray(domState) ? domState : this.extractElementsFromDomState(domState);
    return elements.some((el: any) =>
      el.text?.toLowerCase().includes('compare') ||
      el.text?.toLowerCase().includes('compare products')
    );
  }

  addExtractedData(key: string, value: any): void {
    if (value !== null && value !== undefined && value !== '') {
      this.extractedData.set(key, value);
      this.persistentData.set(key, value);
      console.log(`📝 Added extracted data - ${key}: ${truncateForLogging(value, 100)}`);
    }
  }

  /**
   * Merge multiple extracted data entries at once
   * Used when receiving extracted data from TaskExecutor
   */
  mergeExtractedData(data: Record<string, any>): void {
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined && value !== '') {
        this.extractedData.set(key, value);
        this.persistentData.set(key, value);
        console.log(`📝 Merged extracted data - ${key}: ${truncateForLogging(value, 100)}`);
      }
    }
  }

  /**
   * Create a new state with specific extracted data
   * Used when we need to create a state from executor results
   */
  async captureStateWithData(extractedData: Record<string, any>): Promise<PageState> {
    // First merge the data
    this.mergeExtractedData(extractedData);
    
    return this.captureState();
  }

  getExtractedData(key: string): any {
    return this.extractedData.get(key);
  }

  getAllExtractedData(): Record<string, any> {
    return {
      ...Object.fromEntries(this.persistentData),
      ...Object.fromEntries(this.extractedData)
    };
  }

  /**
   * Create checkpoint to save current state and data
   * Used for rollback and recovery during replanning
   */
  createCheckpoint(name: string): void {
    if (this.currentState) {
      this.checkpoints.set(name, {  
        ...this.currentState,
        extractedData: this.getAllExtractedData()
      });
      console.log(`💾 Created checkpoint: ${name}`);
    }
  }

  /**
   * Get a specific checkpoint
   */
  getCheckpoint(name: string): PageState | undefined {
    return this.checkpoints.get(name);
  }

  /**
   * List all available checkpoints
   */
  getCheckpointNames(): string[] {
    return Array.from(this.checkpoints.keys());
  }

  /**
   * Clear old checkpoints to manage memory
   */
  clearOldCheckpoints(keepLast: number = 5): void {
    const names = this.getCheckpointNames();
    if (names.length > keepLast) {
      const toRemove = names.slice(0, names.length - keepLast);
      toRemove.forEach(name => {
        this.checkpoints.delete(name);
        console.log(`🗑️ Removed old checkpoint: ${name}`);
      });
    }
  }

  getStateHistory(): PageState[] {
    return [...this.stateHistory];
  }

  getCurrentState(): PageState | null {
    return this.currentState;
  }

  getPreviousState(): PageState | null {
    return this.stateHistory.length > 1 ? 
           this.stateHistory[this.stateHistory.length - 2] : null;
  }

  clearHistory(): void {
    this.stateHistory = [];
    this.currentState = null;
  }

  clearExtractedData(): void {
    this.extractedData.clear();
  }

  /**
   * Clear all persistent data (use with caution)
   */
  clearPersistentData(): void {
    this.persistentData.clear();
    console.log(`🗑️ Cleared persistent data`);
  }

  /**
   * Clear both current and persistent data completely
   */
  clearAllExtractedData(): void {
    this.extractedData.clear();
    this.persistentData.clear();
    console.log(`🗑️ Cleared all extracted data (current + persistent)`);
  }
}