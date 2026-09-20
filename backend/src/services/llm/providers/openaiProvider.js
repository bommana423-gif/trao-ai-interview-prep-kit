import { BaseLlmProvider } from './baseProvider.js';
import { ProviderRateLimitError, ProviderServiceError } from '../resilience/retryWithBackoff.js';

export class OpenAiProvider extends BaseLlmProvider {
  constructor(apiKey, model = 'gpt-4o-mini') {
    super('openai');
    this.apiKey = apiKey;
    this.model = model || 'gpt-4o-mini';
  }

  async generate({ systemPrompt = '', userPrompt = '', temperature = 0.2, maxTokens = 4096, responseFormat = 'json' }) {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured in environment.');
    }

    const endpoint = 'https://api.openai.com/v1/chat/completions';

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const payload = {
      model: this.model,
      messages,
      temperature,
      max_tokens: maxTokens
    };

    if (responseFormat === 'json') {
      payload.response_format = { type: 'json_object' };
    }

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000)
      });
    } catch (networkErr) {
      throw new ProviderServiceError(`Network error connecting to OpenAI: ${networkErr.message}`, 503);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;
        throw new ProviderRateLimitError(`OpenAI 429 Rate Limit: ${errorText}`, retryAfterSeconds);
      }
      if (response.status >= 500) {
        throw new ProviderServiceError(`OpenAI ${response.status} Service Error: ${errorText}`, response.status);
      }
      throw new Error(`OpenAI API error (HTTP ${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content returned in OpenAI response choices');
    }

    return {
      content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens
      } : undefined
    };
  }
}

export default OpenAiProvider;
