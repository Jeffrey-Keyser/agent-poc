# URL Extraction Feature

## Overview
Added dedicated URL extraction capabilities to the multi-agent system to solve the problem where the system was unable to extract product URLs from e-commerce sites like Amazon.

## Problem
The original `extract` action only extracted text content from DOM elements. When trying to extract URLs (like product detail page URLs), the system would fail and return unrelated text like promotional messages instead of the actual URL.

## Solution
Implemented two new micro-action types:

### 1. `extract_url`
- **Purpose**: Extract the current page URL directly from the browser
- **Usage**: No `elementIndex` required
- **Implementation**: Uses `browser.getPageUrl()` to get the current URL
- **Example Use Case**: Getting the URL after navigating to a product detail page

### 2. `extract_href`
- **Purpose**: Extract href attribute from anchor/link elements
- **Usage**: Requires `elementIndex` to specify which link element
- **Implementation**: Extracts the `href` attribute from the specified element
- **Example Use Case**: Getting product URLs from search result links before clicking

## Files Modified

1. **`src/core/types/agent-types.ts`**
   - Added `'extract_url' | 'extract_href'` to MicroAction type union

2. **`src/core/agents/task-executor/task-executor.prompt.ts`**
   - Added documentation for new extraction actions
   - Updated micro-action format to include new types

3. **`src/core/agents/task-executor/task-executor.ts`**
   - Implemented `extract_url` case using `browser.getPageUrl()`
   - Implemented `extract_href` case to extract href attributes from elements

4. **`src/core/agents/task-evaluator/task-evaluator.prompt.ts`**
   - Updated evaluation criteria to recognize URL extraction
   - Added examples for URL extraction success evaluation

## Usage Example

When the LLM plans to extract a product URL, it can now generate:

```json
{
  "microActions": [
    {
      "type": "click",
      "elementIndex": 42,
      "description": "Click on first product"
    },
    {
      "type": "wait",
      "value": 2000,
      "description": "Wait for page to load"
    },
    {
      "type": "extract_url",
      "description": "Extract the product detail page URL"
    }
  ]
}
```

## Testing

Run the test script to verify the URL extraction functionality:

```bash
npm run test:url-extraction
```

This will:
1. Search Amazon for "wireless headphones"
2. Navigate to a product detail page
3. Extract the URL using the new `extract_url` action
4. Verify the extracted URL is valid

## Benefits

1. **Direct URL Access**: LLM can now directly request the current page URL
2. **Href Extraction**: Can extract links before clicking them
3. **Reliability**: No more confusion between text content and URLs
4. **Backward Compatible**: Existing `extract` action still works for text content
5. **Clear Intent**: Separate actions make the intent clearer to the LLM

## Future Enhancements

Consider adding:
- `extract_attribute`: Generic attribute extraction from any element
- `extract_all_links`: Extract all hrefs from a page section
- URL validation and normalization
- Relative URL to absolute URL conversion