import { BaseLlmProvider } from './baseProvider.js';
import { ProviderRateLimitError, ProviderServiceError } from '../resilience/retryWithBackoff.js';

export class GeminiProvider extends BaseLlmProvider {
  constructor(apiKey, model = 'gemini-1.5-flash') {
    super('gemini');
    this.apiKey = apiKey;
    this.model = model || 'gemini-1.5-flash';
  }

  async generate({ systemPrompt = '', userPrompt = '', temperature = 0.2, maxTokens = 4096, responseFormat = 'json' }) {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

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

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000)
      });
    } catch (networkErr) {
      throw new ProviderServiceError(`Network error connecting to Gemini API: ${networkErr.message}`, 503);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (response.status === 429) {
        throw new ProviderRateLimitError(`Gemini 429 Quota/Rate Limit: ${errorText}`);
      }
      if (response.status >= 500) {
        throw new ProviderServiceError(`Gemini ${response.status} Service Error: ${errorText}`, response.status);
      }
      throw new Error(`Gemini API error (HTTP ${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No candidate content returned by Gemini API');
    }

    return {
      content: text,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount
      } : undefined
    };
  }
}

export default GeminiProvider;
