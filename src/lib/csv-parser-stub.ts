/**
 * Browser stub for csv-parser (Node.js-only module).
 * goat-fin's taxCalculator.ts imports csv-parser at the top level,
 * but we never call the CSV parsing functions from the browser.
 * This stub prevents the "Buffer is not defined" error.
 */
export default function csvParser(_opts?: unknown) {
  throw new Error('csv-parser is not available in the browser. Use server-side parsing instead.');
}
