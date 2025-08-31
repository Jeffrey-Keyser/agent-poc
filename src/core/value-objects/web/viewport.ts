import { Result } from './url';

/**
 * Value object representing browser viewport dimensions
 */
export class Viewport {
  private constructor(
    public readonly width: number,
    public readonly height: number
  ) {}

  static create(width: number, height: number): Result<Viewport> {
    if (width <= 0) {
      return Result.fail('Viewport width must be positive');
    }

    if (height <= 0) {
      return Result.fail('Viewport height must be positive');
    }

    if (width > 7680 || height > 4320) {
      return Result.fail('Viewport dimensions cannot exceed 8K resolution');
    }

    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      return Result.fail('Viewport dimensions must be integers');
    }

    return Result.ok(new Viewport(width, height));
  }

  /**
   * Common viewport presets
   */
  static mobile(): Viewport {
    return new Viewport(375, 667); // iPhone SE
  }

  static tablet(): Viewport {
    return new Viewport(768, 1024); // iPad
  }

  static desktop(): Viewport {
    return new Viewport(1920, 1080); // Full HD
  }

  static smallDesktop(): Viewport {
    return new Viewport(1366, 768); // Common laptop resolution
  }

  toString(): string {
    return `${this.width}x${this.height}`;
  }

  /**
   * Returns the aspect ratio as width/height
   */
  getAspectRatio(): number {
    return this.width / this.height;
  }

  /**
   * Returns the total pixel count
   */
  getPixelCount(): number {
    return this.width * this.height;
  }

  /**
   * Checks if this viewport is in landscape orientation
   */
  isLandscape(): boolean {
    return this.width > this.height;
  }

  /**
   * Checks if this viewport is in portrait orientation
   */
  isPortrait(): boolean {
    return this.height > this.width;
  }

  /**
   * Checks if this viewport is square
   */
  isSquare(): boolean {
    return this.width === this.height;
  }

  /**
   * Returns a new viewport with different width
   */
  withWidth(newWidth: number): Result<Viewport> {
    return Viewport.create(newWidth, this.height);
  }

  /**
   * Returns a new viewport with different height
   */
  withHeight(newHeight: number): Result<Viewport> {
    return Viewport.create(this.width, newHeight);
  }

  /**
   * Returns a new viewport scaled by the given factor
   */
  scale(factor: number): Result<Viewport> {
    if (factor <= 0) {
      return Result.fail('Scale factor must be positive');
    }

    const newWidth = Math.round(this.width * factor);
    const newHeight = Math.round(this.height * factor);
    
    return Viewport.create(newWidth, newHeight);
  }

  equals(other: Viewport): boolean {
    return this.width === other.width && this.height === other.height;
  }

  /**
   * Checks if this viewport can fit another viewport
   */
  canContain(other: Viewport): boolean {
    return this.width >= other.width && this.height >= other.height;
  }

  /**
   * Classification helpers
   */
  isMobile(): boolean {
    return this.width <= 768;
  }

  isTablet(): boolean {
    return this.width > 768 && this.width <= 1024;
  }

  isDesktop(): boolean {
    return this.width > 1024;
  }
}