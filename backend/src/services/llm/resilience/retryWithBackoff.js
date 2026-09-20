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

      // 1. Immediately fail permanent non-retryable errors
      const isPermanentError =
        error.name === 'SchemaValidationError' ||
        error.isDailyQuota === true ||
        error.exhausted === true ||
        error.statusCode === 400 ||
        error.status === 400 ||
        error.statusCode === 401 ||
        error.status === 401 ||
        error.statusCode === 403 ||
        error.status === 403 ||
        error.statusCode === 404 ||
        error.status === 404 ||
        (error.message && (
          error.message.includes('GenerateRequestsPerDay') ||
          error.message.toLowerCase().includes('daily quota') ||
          error.message.toLowerCase().includes('perday') ||
          error.message.toLowerCase().includes('per day') ||
          error.message.toLowerCase().includes('api_key') ||
          error.message.toLowerCase().includes('api key') ||
          error.message.toLowerCase().includes('permission denied') ||
          error.message.toLowerCase().includes('unauthorized') ||
          error.message.toLowerCase().includes('invalid argument')
        ));

      if (isPermanentError) {
        throw error;
      }

      const isRateLimit = 
        error.statusCode === 429 || 
        error.status === 429 || 
        (error.message && error.message.toLowerCase().includes('rate limit')) ||
        (error.message && error.message.toLowerCase().includes('quota')) ||
        (error.message && error.message.toLowerCase().includes('resource_exhausted'));

      const isServerError = 
        (error.statusCode >= 500 && error.statusCode < 600) ||
        (error.status >= 500 && error.status < 600) ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        error.name === 'AbortError' ||
        error.name === 'TimeoutError' ||
        (error.message && (
          error.message.includes('503') ||
          error.message.includes('500') ||
          error.message.includes('502') ||
          error.message.includes('504') ||
          error.message.toLowerCase().includes('service error') ||
          error.message.toLowerCase().includes('service unavailable') ||
          error.message.toLowerCase().includes('high demand') ||
          error.message.toLowerCase().includes('overloaded') ||
          error.message.toLowerCase().includes('temporary') ||
          error.message.toLowerCase().includes('spikes in demand') ||
          error.message.toLowerCase().includes('fetch failed') ||
          error.message.toLowerCase().includes('network error')
        ));

      const isParseError = error.name === 'JsonParseError';

      const isRetryable = isRateLimit || isServerError || isParseError;

      if (!isRetryable || attempt > maxRetries) {
        error.exhausted = true;
        throw error;
      }

      // Determine delay
      let delayMs;
      if (isRateLimit && error.retryAfterSeconds) {
        delayMs = Math.min(error.retryAfterSeconds * 1000, maxDelayMs);
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
