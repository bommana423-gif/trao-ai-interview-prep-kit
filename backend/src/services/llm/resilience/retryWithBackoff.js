/**
 * Resilience utility providing exponential backoff with jitter for LLM provider requests.
 * Explicitly handles HTTP 429 (Rate Limit) and HTTP 5xx (Server Errors).
 */

export class ProviderRateLimitError extends Error {
  constructor(message, retryAfterSeconds = null) {
    super(message);
    this.name = 'ProviderRateLimitError';
    this.statusCode = 429;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ProviderServiceError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'ProviderServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Executes an async operation with exponential backoff and jitter upon transient failure.
 *
 * @param {Function} operation - Async function to execute
 * @param {Object} options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.baseDelayMs - Initial delay in ms (default: 500ms)
 * @param {number} options.maxDelayMs - Cap for delay (default: 8000ms)
 * @param {number} options.jitterMs - Random jitter bound (default: 250ms)
 * @param {Function} options.onRetry - Optional callback invoked on retry (attempt, error, delayMs)
 */
export async function executeWithRetry(operation, options = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    jitterMs = 250,
    onRetry = null
  } = options;

  let attempt = 0;

  while (true) {
    try {
      return await operation(attempt);
    } catch (error) {
      attempt++;

      const isRateLimit = 
        error.statusCode === 429 || 
        error.status === 429 || 
        (error.message && error.message.toLowerCase().includes('rate limit')) ||
        (error.message && error.message.toLowerCase().includes('quota'));

      const isServerError = 
        (error.statusCode >= 500 && error.statusCode < 600) ||
        (error.status >= 500 && error.status < 600) ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT';

      const isRetryable = isRateLimit || isServerError;

      if (!isRetryable || attempt > maxRetries) {
        throw error;
      }

      // Determine delay
      let delayMs;
      if (isRateLimit && error.retryAfterSeconds) {
        delayMs = error.retryAfterSeconds * 1000;
      } else {
        const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * jitterMs);
        delayMs = Math.min(exponentialDelay + jitter, maxDelayMs);
      }

      if (typeof onRetry === 'function') {
        onRetry({ attempt, error, delayMs });
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

export default {
  executeWithRetry,
  ProviderRateLimitError,
  ProviderServiceError
};
