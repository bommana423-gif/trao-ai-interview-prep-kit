/**
 * Robust JSON extraction and parsing utility for LLM generation responses.
 * Handles markdown code fences, leading/trailing conversational text, comments,
 * missing commas between array elements/properties, unescaped characters, and truncated outputs.
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
  if (text.includes('```')) {
    text = text.replace(/^[\s\S]*?```(?:json)?\s*\r?\n?/i, '');
    text = text.replace(/\r?\n?```[\s\S]*$/i, '');
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
 * Strips single-line and multi-line comments outside of double-quoted strings
 */
function stripCommentsOutsideStrings(text) {
  let cleaned = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const nextCh = text[i + 1];

    if (inString) {
      cleaned += ch;
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
        cleaned += ch;
      } else if (ch === '/' && nextCh === '/') {
        // Line comment: skip until newline
        while (i < text.length && text[i] !== '\n' && text[i] !== '\r') {
          i++;
        }
        if (i < text.length) {
          cleaned += text[i];
        }
      } else if (ch === '/' && nextCh === '*') {
        // Block comment: skip until */
        i += 2;
        while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
          i++;
        }
        i++; // skip closing /
      } else {
        cleaned += ch;
      }
    }
  }
  return cleaned;
}

/**
 * Normalizes unescaped newlines and tabs inside double-quoted string literals
 */
function fixUnescapedControlCharsInStrings(text) {
  let result = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        result += ch;
      } else if (ch === '\\') {
        escape = true;
        result += ch;
      } else if (ch === '"') {
        inString = false;
        result += ch;
      } else if (ch === '\n') {
        result += '\\n';
      } else if (ch === '\r') {
        // omit bare carriage return inside string
      } else if (ch === '\t') {
        result += '\\t';
      } else {
        result += ch;
      }
    } else {
      if (ch === '"') {
        inString = true;
      }
      result += ch;
    }
  }
  return result;
}

/**
 * Escapes unescaped inner double quotes in property values and array strings
 */
function fixUnescapedInnerQuotes(text) {
  return text.split('\n').map(line => {
    // Property value: "key": "value with "inner" quotes",
    const propMatch = line.match(/^(\s*"[^"]+"\s*:\s*")(.*)("[\s,]*)$/);
    if (propMatch) {
      const prefix = propMatch[1];
      let inner = propMatch[2];
      const suffix = propMatch[3];
      inner = inner.replace(/(?<!\\)"/g, '\\"');
      return prefix + inner + suffix;
    }
    // Array string element: "value with "inner" quotes",
    const arrMatch = line.match(/^(\s*")(.*)("[\s,]*)$/);
    if (arrMatch && !line.includes(':')) {
      const prefix = arrMatch[1];
      let inner = arrMatch[2];
      const suffix = arrMatch[3];
      inner = inner.replace(/(?<!\\)"/g, '\\"');
      return prefix + inner + suffix;
    }
    return line;
  }).join('\n');
}

/**
 * Auto-closes any open braces or brackets if JSON was truncated
 */
export function autoCloseBrackets(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  const openStack = [];
  let inStr = false;
  let esc = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
    } else {
      if (ch === '"') {
        inStr = true;
      } else if (ch === '{') {
        openStack.push('}');
      } else if (ch === '[') {
        openStack.push(']');
      } else if (ch === '}' || ch === ']') {
        if (openStack.length > 0 && openStack[openStack.length - 1] === ch) {
          openStack.pop();
        }
      }
    }
  }

  if (openStack.length === 0) {
    return text;
  }

  let closed = text.trim().replace(/,\s*$/, '');
  while (openStack.length > 0) {
    closed += openStack.pop();
  }
  return closed;
}

/**
 * Repairs common LLM JSON syntax errors:
 * 1. Strips comments (// and /* *\/) outside strings
 * 2. Removes trailing commas before } and ]
 * 3. Removes trailing ellipses (...)
 * 4. Inserts missing commas between array elements (e.g. } \n { or " \n ")
 * 5. Inserts missing commas between object properties
 * 6. Normalizes unescaped newlines/tabs inside strings
 * 7. Escapes unescaped inner quotes inside strings
 */
export function sanitizeJsonString(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') {
    return jsonStr;
  }

  let text = jsonStr;

  // Pass 1: Strip comments outside strings
  text = stripCommentsOutsideStrings(text);

  // Pass 2: Remove trailing commas before closing braces/brackets
  text = text.replace(/,\s*([}\]])/g, '$1');

  // Pass 3: Remove trailing ellipses
  text = text.replace(/,\s*\.{3,}\s*([}\]])/g, '$1');
  text = text.replace(/\s*\.{3,}\s*([}\]])/g, '$1');

  // Pass 4: Insert missing commas between array elements
  // a) Between objects in array: } \n { -> }, \n { (the classic Gemini array element fault)
  text = text.replace(/}\s*(\r?\n\s*){/g, '},$1{');
  // b) Between nested arrays: ] \n [ -> ], \n [
  text = text.replace(/]\s*(\r?\n\s*)\[/g, '],$1[');
  // c) Between nested array and object: ] \n { -> ], \n {
  text = text.replace(/]\s*(\r?\n\s*){/g, '],$1{');
  // d) Between object and string in array: } \n " -> }, \n "
  text = text.replace(/}\s*(\r?\n\s*)"/g, '},$1"');
  // e) Between string and object in array: " \n { -> ", \n {
  text = text.replace(/"\s*(\r?\n\s*){/g, '",$1{');
  // f) Between string items in array: "item1" \n "item2" (where second is not an object key)
  text = text.replace(/"\s*(\r?\n\s*)"(?![^"\n\r]*\s*:)/g, '",$1"');
  // g) Between primitive values in array
  text = text.replace(/(true|false|null|\d+)\s*(\r?\n\s*)(["\d]|true|false|null|{|\[)/g, '$1,$2$3');

  // Pass 5: Insert missing commas between object properties
  text = text.replace(/(["\d]|true|false|null|}|])\s*(\r?\n\s*)("[^"\r\n]+"\s*:)/g, '$1,$2$3');

  // Pass 6: Re-clean trailing commas
  text = text.replace(/,\s*([}\]])/g, '$1');

  // Pass 7: Escape raw newlines/tabs inside string literals
  text = fixUnescapedControlCharsInStrings(text);

  // Pass 8: Escape inner quotes inside string literals
  text = fixUnescapedInnerQuotes(text);

  return text;
}

/**
 * Parses raw text from an LLM into a structured JavaScript object.
 * Layered recovery strategy:
 * 1. Fast path: Direct JSON.parse
 * 2. Sanitized parse: repair trailing/missing commas, comments, control chars
 * 3. Truncation repair: auto-close unbalanced braces/brackets
 */
export function parseLlmJson(rawText) {
  let extracted;
  try {
    extracted = extractJsonString(rawText);
  } catch (extractErr) {
    // If extractJsonString failed, check if output was truncated without closing brace
    if (rawText && typeof rawText === 'string') {
      const firstBrace = rawText.indexOf('{');
      const firstBracket = rawText.indexOf('[');
      let startIdx = -1;
      if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        startIdx = firstBrace;
      } else if (firstBracket !== -1) {
        startIdx = firstBracket;
      }
      if (startIdx !== -1) {
        extracted = autoCloseBrackets(rawText.substring(startIdx));
      } else {
        throw extractErr;
      }
    } else {
      throw extractErr;
    }
  }

  // 1. Direct parse (fast path for valid JSON)
  try {
    return JSON.parse(extracted);
  } catch (initialErr) {
    // 2. Sanitized parse (repairs missing commas, comments, trailing commas, unescaped chars)
    try {
      const sanitized = sanitizeJsonString(extracted);
      return JSON.parse(sanitized);
    } catch {
      // 3. Auto-close truncated structures on sanitized text
      try {
        const closed = autoCloseBrackets(sanitizeJsonString(extracted));
        return JSON.parse(closed);
      } catch {
        throw new JsonParseError(
          `Failed to parse LLM JSON: ${initialErr.message}`,
          rawText
        );
      }
    }
  }
}

export default {
  parseLlmJson,
  extractJsonString,
  sanitizeJsonString,
  autoCloseBrackets,
  JsonParseError
};
