export function splitArray<T>(array: T[], numberOfChunk: number): T[][] {
  const chunkSize = Math.ceil(array.length / numberOfChunk);
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }
  return result;
}

/**
 * Truncates extracted data for logging purposes to prevent overly long log entries
 * while preserving readability. Full data is preserved in the actual workflow.
 */
export function truncateForLogging(value: any, maxLength: number = 200): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > maxLength ? str.substring(0, maxLength) + '... [truncated]' : str;
}

/**
 * Truncates extracted data object for display purposes. Returns a new object
 * with truncated string values while preserving the original data structure.
 */
export function truncateExtractedData(data: Record<string, any>, maxLength: number = 200): Record<string, any> {
  const truncated: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.length > maxLength) {
      truncated[key] = value.substring(0, maxLength) + '... [truncated]';
    } else {
      truncated[key] = value;
    }
  }
  return truncated;
}
