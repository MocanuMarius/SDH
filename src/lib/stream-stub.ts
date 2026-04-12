/**
 * Browser stub for Node.js 'stream' module.
 * goat-fin's taxCalculator.ts imports { Readable } from 'stream',
 * but we never use streaming features from the browser.
 */
export class Readable {
  constructor() {
    throw new Error('Node.js streams are not available in the browser.');
  }
}

export class Transform {
  constructor() {
    throw new Error('Node.js streams are not available in the browser.');
  }
}

export class Writable {
  constructor() {
    throw new Error('Node.js streams are not available in the browser.');
  }
}

export default { Readable, Transform, Writable };
