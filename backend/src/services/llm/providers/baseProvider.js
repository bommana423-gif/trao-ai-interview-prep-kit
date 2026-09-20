/**
 * Base abstract interface for LLM providers in the Trao Prep Kit architecture.
 */

export class BaseLlmProvider {
  constructor(name = 'base') {
    this.name = name;
  }

  /**
   * Generates a text or JSON completion from the LLM provider.
   *
   * @param {Object} params
   * @param {string} params.systemPrompt - Guiding system instructions
   * @param {string} params.userPrompt - User input or stage payload
   * @param {number} [params.temperature=0.2] - Sampling temperature
   * @param {number} [params.maxTokens=4096] - Maximum output tokens
   * @param {string} [params.responseFormat='json'] - 'json' or 'text'
   * @returns {Promise<{ content: string, usage?: { promptTokens: number, completionTokens: number } }>}
   */
  async generate(_options = {}) {
    throw new Error(`Method "generate" not implemented in provider ${this.name}`);
  }
}

export default BaseLlmProvider;
