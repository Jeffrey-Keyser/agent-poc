# Playwright Navigation and Screenshot Fixes

## Current Issues

1. **Deprecated `waitForNavigation`** - Using deprecated Playwright API
2. **Screenshot too large** - 1.3MB screenshot exceeds GPT-4 Vision context window (400 Bad Request)
3. **Navigation not working properly** - Links found but click navigation fails

## Fixes to Implement

### 1. Fix Navigation with URL Change Detection

Replace deprecated `waitForNavigation` with `waitForURL` that checks for any URL change:

```typescript
// In findAndClickPricingLink function, replace:
await element.click();
await page.waitForNavigation({ waitUntil: 'networkidle' });

// With:
// Store current URL before clicking
const currentUrl = page.url();

// Click the element
await element.click();

// Wait for URL to change to ANY different URL
await page.waitForURL(url => url.toString() !== currentUrl, {
  waitUntil: 'networkidle',
  timeout: 5000
});

console.log(`✅ Navigated from ${currentUrl} to ${page.url()}`);
```

### 2. Optimize Screenshot Size

Change all screenshots from full-page PNG to viewport JPEG with compression:

```typescript
// In navigateAndFindPricingTool:
const mainScreenshot = await page.screenshot({ 
  fullPage: false,  // Just viewport, not full page
  type: 'jpeg',
  quality: 70       // 70% quality to reduce size
});

// For pricing page:
const pricingScreenshot = await page.screenshot({ 
  fullPage: false,  // Viewport only
  type: 'jpeg',
  quality: 70
});
```

### 3. Update captureAndAnalyzePricingTool

Also optimize the standalone pricing tool:

```typescript
const screenshot = await page.screenshot({ 
  fullPage: false,  // Change from true to false
  type: 'jpeg',     // Change from 'png' to 'jpeg'
  quality: 70       // Add compression
});
```

## Files to Modify

- `/mnt/c/Users/JKeyser/Documents/temp/agents/agent-poc.ts`
  - Update `findAndClickPricingLink` function (around line 145)
  - Update screenshot capture in `navigateAndFindPricingTool` (around line 187 and 216)
  - Update screenshot capture in `captureAndAnalyzePricingTool` (around line 279)

## Current Status

- ✅ Playwright browsers installed and working
- ✅ Navigation finds pricing links successfully
- ❌ Navigation click fails due to deprecated API
- ❌ Screenshot exceeds context window (1.3MB too large)

## Expected Results After Fixes

1. ✅ No more deprecation warnings
2. ✅ Screenshots will be ~200-300KB instead of 1.3MB
3. ✅ Navigation will work properly with URL change detection
4. ✅ Agent will successfully analyze pricing pages within context limits

## Test Command

```bash
yarn start
# or
npm start
```

## Error Context

```
❌ Error running agent: BadRequestError: 400 Your input exceeds the context window of this model. Please adjust your input and try again.
```

The main page screenshot was 1,340,664 bytes (1.3MB), which is too large for GPT-4 Vision API.