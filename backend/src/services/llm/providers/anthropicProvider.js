import { BaseLlmProvider } from './baseProvider.js';
import { ProviderRateLimitError, ProviderServiceError } from '../resilience/retryWithBackoff.js';

export class AnthropicProvider extends BaseLlmProvider {
  constructor(apiKey, model = 'claude-3-5-haiku-20241022') {
    super('anthropic');
    this.apiKey = apiKey;
    this.model = model || 'claude-3-5-haiku-20241022';
  }

  async generate({ systemPrompt = '', userPrompt = '', temperature = 0.2, maxTokens = 4096, responseFormat = 'json' }) {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured in environment.');
    }

    const endpoint = 'https://api.anthropic.com/v1/messages';

    // If JSON requested, reinforce in prompt for Claude
    const enhancedPrompt = responseFormat === 'json'
      ? `${userPrompt}\n\nIMPORTANT: Return ONLY valid, parseable JSON matching the requested schema. Do not include markdown preamble or conversational text.`
      : userPrompt;

    const payload = {
      model: this.model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: enhancedPrompt }]
    };

    if (systemPrompt) {
      payload.system = systemPrompt;
    }

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000)
      });
    } catch (networkErr) {
      throw new ProviderServiceError(`Network error connecting to Anthropic: ${networkErr.message}`, 503);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (response.status === 429) {
        throw new ProviderRateLimitError(`Anthropic 429 Rate Limit: ${errorText}`);
      }
      if (response.status >= 500) {
        throw new ProviderServiceError(`Anthropic ${response.status} Service Error: ${errorText}`, response.status);
      }
      throw new Error(`Anthropic API error (HTTP ${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const contentBlock = data.content?.[0];
    const text = contentBlock?.text;

    if (!text) {
      throw new Error('No content block returned by Anthropic API');
    }

    return {
      content: text,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens
      } : undefined
    };
  }
}

export default AnthropicProvider;
