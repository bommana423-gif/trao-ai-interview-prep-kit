/**
 * Robust JSON extraction and parsing utility for LLM generation responses.
 * Handles markdown code fences, leading/trailing conversational text, and common JSON syntax faults.
 */

export class JsonParseError extends Error {
  constructor(message, rawText) {
    super(message);
    this.name = 'JsonParseError';
    this.rawText = rawText;
  }
}

/**
 * Strips markdown code fences (```json ... ```) or conversational commentary.
 * Finds the first `{` or `[` and the corresponding last `}` or `]`.
 */
export function extractJsonString(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new JsonParseError('Empty or non-string response from LLM', rawText);
  }

  let text = rawText.trim();

  // 1. Remove markdown code fences if present
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/, '');
    text = text.replace(/\n?```\s*$/, '');
    text = text.trim();
  }

  // 2. Locate outermost JSON object {...} or array [...]
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');

  let startIndex = -1;
  let endIndex = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIndex = firstBrace;
    endIndex = text.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIndex = firstBracket;
    endIndex = text.lastIndexOf(']');
  }

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new JsonParseError('No valid JSON object or array found in LLM output', rawText);
  }

  return text.substring(startIndex, endIndex + 1);
}

/**
 * Repairs common LLM JSON syntax errors such as trailing commas before closing braces/brackets.
 */
export function sanitizeJsonString(jsonStr) {
  return jsonStr
    // Remove trailing commas in objects: { "a": 1, } -> { "a": 1 }
    .replace(/,\s*([}\]])/g, '$1')
    // Remove trailing commas in multi-line objects: ,\n  } -> \n  }
    .replace(/,(\s*\n+\s*[}\]])/g, '$1');
}

/**
 * Parses raw text from an LLM into a structured JavaScript object.
 */
export function parseLlmJson(rawText) {
  const extracted = extractJsonString(rawText);

  try {
    return JSON.parse(extracted);
  } catch (initialErr) {
    // Attempt sanitization (trailing comma repair)
    try {
      const sanitized = sanitizeJsonString(extracted);
      return JSON.parse(sanitized);
    } catch {
      throw new JsonParseError(
        `Failed to parse LLM JSON: ${initialErr.message}`,
        rawText
      );
    }
  }
}

export default {
  parseLlmJson,
  extractJsonString,
  sanitizeJsonString,
  JsonParseError
};
