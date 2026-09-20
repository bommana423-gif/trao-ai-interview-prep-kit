import { BaseLlmProvider } from './baseProvider.js';
import {
  executeWithRetry,
  ProviderRateLimitError,
  ProviderServiceError
} from '../resilience/retryWithBackoff.js';

export class GeminiProvider extends BaseLlmProvider {
  constructor(apiKey, model = 'gemini-3.6-flash', options = {}) {
    super('gemini');
    this.apiKey = apiKey;
    this.model = model || 'gemini-3.6-flash';
    this.fetchFn = options.fetch || globalThis.fetch;
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 2;
    this.baseDelayMs = options.baseDelayMs !== undefined ? options.baseDelayMs : 1000;
    this.maxDelayMs = options.maxDelayMs !== undefined ? options.maxDelayMs : 25000;
    this.jitterMs = options.jitterMs !== undefined ? options.jitterMs : 250;
    this.onRetry = options.onRetry || null;
  }

  _redact(str) {
    if (!str || typeof str !== 'string') {
      return str;
    }
    if (this.apiKey) {
      return str.replaceAll(this.apiKey, '[REDACTED]');
    }
    return str;
  }

  _extractQuotaInfo(errorText, headers) {
    let isDailyQuota = false;
    let retryAfterSeconds = null;
    let cleanMessage = '';

    // 1. Check HTTP response header
    const headerVal = headers?.get?.('retry-after');
    if (headerVal) {
      const parsedHeader = parseInt(headerVal, 10);
      if (!isNaN(parsedHeader) && parsedHeader > 0) {
        retryAfterSeconds = parsedHeader;
      }
    }

    // 2. Parse JSON response if available
    try {
      const parsed = JSON.parse(errorText);
      const errObj = parsed.error || parsed;
      cleanMessage = errObj.message || '';

      const details = Array.isArray(errObj.details) ? errObj.details : [];
      for (const d of details) {
        // RetryInfo support (e.g. google.rpc.RetryInfo with retryDelay: "18s" or "18.5s")
        if (d['@type']?.includes('RetryInfo') || d.retryDelay) {
          const delayStr = d.retryDelay;
          if (typeof delayStr === 'string') {
            const match = delayStr.match(/([0-9.]+)/);
            if (match) {
              retryAfterSeconds = Math.ceil(parseFloat(match[1]));
            }
          } else if (typeof delayStr === 'number') {
            retryAfterSeconds = Math.ceil(delayStr);
          }
        }

        // QuotaFailure violations (e.g. GenerateRequestsPerDayPerProject-FreeTier)
        if (Array.isArray(d.violations)) {
          for (const v of d.violations) {
            const text = `${v.subject || ''} ${v.description || ''}`.toLowerCase();
            if (
              text.includes('perday') ||
              text.includes('per day') ||
              text.includes('daily')
            ) {
              isDailyQuota = true;
            }
          }
        }
      }
    } catch {
      // Plain text or unparseable JSON
    }

    // 3. Fallback regex checks on raw errorText
    const lower = (errorText || '').toLowerCase();
    if (
      lower.includes('generaterequestsperday') ||
      lower.includes('perday') ||
      lower.includes('per day') ||
      lower.includes('daily')
    ) {
      isDailyQuota = true;
    }

    if (retryAfterSeconds === null) {
      const match = errorText.match(/retryDelay["']?\s*:\s*["']?([0-9.]+)\s*s?/i) ||
                    errorText.match(/retry(?:ing)? in ([0-9.]+)\s*s/i) ||
                    errorText.match(/retry after ([0-9.]+)\s*s/i) ||
                    errorText.match(/retryDelay:\s*([0-9.]+)\s*seconds/i);
      if (match) {
        retryAfterSeconds = Math.ceil(parseFloat(match[1]));
      }
    }

    return { isDailyQuota, retryAfterSeconds, cleanMessage };
  }

  async generate({ systemPrompt = '', userPrompt = '', temperature = 0.2, maxTokens = 4096, responseFormat = 'json' }) {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment.');
    }

    // Google Generative Language REST endpoint (authenticate via x-goog-api-key header to prevent key leak in URLs)
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens
      }
    };

    if (systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    if (responseFormat === 'json') {
      payload.generationConfig.responseMimeType = 'application/json';
    }

    return await executeWithRetry(
      async () => {
        let response;
        try {
          response = await this.fetchFn(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.apiKey
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(60000)
          });
        } catch (networkErr) {
          const redactedMessage = this._redact(networkErr.message);
          throw new ProviderServiceError(
            `Network error connecting to Gemini API: ${redactedMessage}`,
            503
          );
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          const sanitizedError = this._redact(errorText);

          // 429: Rate Limit / Quota Exceeded (Transient vs Daily Quota)
          if (response.status === 429) {
            const quotaInfo = this._extractQuotaInfo(sanitizedError, response.headers);

            if (quotaInfo.isDailyQuota) {
              const userFacingMsg = `Gemini API daily quota exhausted (${this.model}: GenerateRequestsPerDayPerProject limit reached). Daily quota cannot be resolved by immediate retry. Please try again tomorrow, upgrade your Gemini API quota, or use the mock provider.`;
              const quotaErr = new ProviderRateLimitError(userFacingMsg, null);
              quotaErr.isDailyQuota = true;
              quotaErr.exhausted = true;
              throw quotaErr;
            }

            // Transient rate limit (e.g. per-minute RPM / Concurrency)
            throw new ProviderRateLimitError(
              `Gemini 429 Quota/Rate Limit: ${quotaInfo.cleanMessage || sanitizedError}`,
              quotaInfo.retryAfterSeconds
            );
          }

          // 5xx: Service Unavailable (503), Internal Server Error (500), Bad Gateway (502), Gateway Timeout (504) (Transient)
          if (response.status >= 500) {
            throw new ProviderServiceError(
              `Gemini ${response.status} Service Error: ${sanitizedError}`,
              response.status
            );
          }

          // Permanent 4xx client errors (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found)
          const permanentError = new Error(`Gemini API error (HTTP ${response.status}): ${sanitizedError}`);
          permanentError.statusCode = response.status;
          permanentError.status = response.status;
          throw permanentError;
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;

        if (!text) {
          const finishReason = candidate?.finishReason || 'NO_CONTENT';
          throw new Error(`No candidate content returned by Gemini API (${finishReason})`);
        }

        return {
          content: text,
          usage: data.usageMetadata ? {
            promptTokens: data.usageMetadata.promptTokenCount,
            completionTokens: data.usageMetadata.candidatesTokenCount
          } : undefined
        };
      },
      {
        maxRetries: this.maxRetries,
        baseDelayMs: this.baseDelayMs,
        maxDelayMs: this.maxDelayMs,
        jitterMs: this.jitterMs,
        onRetry: this.onRetry
      }
    );
  }
}

export default GeminiProvider;
