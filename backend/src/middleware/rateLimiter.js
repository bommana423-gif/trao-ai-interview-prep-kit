import { AppError } from './errorHandler.js';

/**
 * High-performance, zero-dependency in-memory sliding window rate limiter middleware.
 * Tracks request timestamps per client IP / key and enforces request ceilings.
 * 
 * @param {object} options
 * @param {number} [options.windowMs=60000] - Window duration in milliseconds (default: 1 minute)
 * @param {number} [options.max=100] - Max allowed requests per window
 * @param {string} [options.message='Too many requests, please try again later.'] - Error message
 * @param {Function} [options.keyGenerator] - Function to derive key from request
 * @param {Function} [options.skip] - Function to determine whether to skip rate limiting
 */
export function createRateLimiter(options = {}) {
  const {
    windowMs = 60 * 1000,
    max = 100,
    message = 'Too many requests from this IP. Please try again later.',
    keyGenerator = (req) => req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown-client',
    skip = () => false
  } = options;

  // In-memory storage: Map<key, number[]> (array of timestamps)
  const store = new Map();

  // Periodic cleanup every 5 minutes to prevent memory leaks from idle keys
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of store.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        store.delete(key);
      } else {
        store.set(key, valid);
      }
    }
  }, 5 * 60 * 1000);

  // Unref timer so it doesn't block process exit in test runners
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return function rateLimiter(req, res, next) {
    if (skip(req)) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();

    const existingTimestamps = store.get(key) || [];
    // Keep only timestamps within the sliding window
    const recentTimestamps = existingTimestamps.filter(t => now - t < windowMs);

    const remaining = Math.max(0, max - recentTimestamps.length);
    const resetTimeSeconds = Math.ceil((now + windowMs) / 1000);

    // Standard HTTP RateLimit Headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining - 1));
    res.setHeader('X-RateLimit-Reset', resetTimeSeconds);

    if (recentTimestamps.length >= max) {
      const oldestInWindow = recentTimestamps[0];
      const retryAfterSec = Math.ceil((oldestInWindow + windowMs - now) / 1000);
      res.setHeader('Retry-After', Math.max(1, retryAfterSec));

      return next(new AppError(message, 429, 'RATE_LIMIT_EXCEEDED'));
    }

    recentTimestamps.push(now);
    store.set(key, recentTimestamps);

    next();
  };
}

export default createRateLimiter;
