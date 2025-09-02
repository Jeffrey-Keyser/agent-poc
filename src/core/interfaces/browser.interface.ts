import { Page } from 'playwright';
import { VariableString } from '../value-objects/variable-string';

export type Coordinates = {
  x: number;
  y: number;
};

export interface Browser {
  close(): Promise<void>;
  launch(url: string): Promise<void>;
  getStablePage(): Promise<Page>;
  getPage(): Page;
  getPageUrl(): string;
  getTitle(): Promise<string>; // Added for multi-agent architecture
  getPixelAbove(): Promise<number>;
  getPixelBelow(): Promise<number>;
  mouseClick(x: number, y: number): Promise<void>;
  fillInput(text: VariableString, coordinates: Coordinates): Promise<void>;
  scrollDown(): Promise<void>;
  scrollUp(): Promise<void>;
  goToUrl(url: string): Promise<void>;
  goBack(): Promise<void>;
  extractContent(): Promise<string>;
  clearInput(coordinates: Coordinates): Promise<void>;
  hover(coordinates: Coordinates): Promise<void>;
  selectOption(coordinates: Coordinates, options: string[]): Promise<void>;
  waitForElement(selector: string, condition: string, timeout?: number): Promise<void>;
  drag(startCoordinates: Coordinates, endCoordinates: Coordinates): Promise<void>;
}
