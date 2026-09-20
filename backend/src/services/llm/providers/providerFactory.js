import config from '../../../config/env.js';
import { GeminiProvider } from './geminiProvider.js';
import { OpenAiProvider } from './openaiProvider.js';
import { AnthropicProvider } from './anthropicProvider.js';
import { MockLlmProvider } from './mockProvider.js';

let activeOverrideProvider = null;

/**
 * Override the global provider instance (used for hermetic unit and integration testing)
 */
export function setGlobalProvider(provider) {
  activeOverrideProvider = provider;
}

/**
 * Clear any active test override
 */
export function clearGlobalProviderOverride() {
  activeOverrideProvider = null;
}

/**
 * Resolves the active LLM provider based on configuration or explicit override
 *
 * @param {string} [requestedProvider] - Optional explicit provider identifier
 * @returns {import('./baseProvider.js').BaseLlmProvider}
 */
export function getLlmProvider(requestedProvider = null) {
  if (activeOverrideProvider) {
    return activeOverrideProvider;
  }

  const providerType = (requestedProvider || config.llmProvider || 'mock').toLowerCase();

  switch (providerType) {
    case 'gemini':
      if (config.geminiApiKey) {
        return new GeminiProvider(config.geminiApiKey, config.llmModel || 'gemini-1.5-flash');
      }
      break;

    case 'openai':
      if (config.openaiApiKey) {
        return new OpenAiProvider(config.openaiApiKey, config.llmModel || 'gpt-4o-mini');
      }
      break;

    case 'anthropic':
      if (config.anthropicApiKey) {
        return new AnthropicProvider(config.anthropicApiKey, config.llmModel || 'claude-3-5-haiku-20241022');
      }
      break;

    case 'mock':
    default:
      return new MockLlmProvider();
  }

  // Fallback to mock provider if selected provider has no API key configured
  console.warn(`[LLM Factory] Provider "${providerType}" requested but no API key configured. Falling back to MockLlmProvider.`);
  return new MockLlmProvider();
}

export default {
  getLlmProvider,
  setGlobalProvider,
  clearGlobalProviderOverride
};
