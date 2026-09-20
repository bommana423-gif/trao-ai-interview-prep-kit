import * as cheerio from 'cheerio';

// Elements to strip entirely from the DOM tree before text extraction
const NOISE_TAGS = [
  'script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 
  'nav', 'footer', 'header', 'form', 'dialog', 'button',
  'video', 'audio', 'picture', 'source', 'track'
];

// Common noisy class / ID selectors (cookie banners, popups, ads)
const NOISE_SELECTORS = [
  '[role="dialog"]',
  '[aria-modal="true"]',
  '.cookie-banner',
  '#cookie-banner',
  '#cookie-consent',
  '.cookie-notice',
  '.advertisement',
  '.ads',
  '.newsletter-signup',
  '.social-share',
  '.popup'
];

/**
 * Clean and distill raw HTML into readable, semantic plain text
 * 
 * @param {string} rawHtml - HTML string
 * @param {object} [options]
 * @param {number} [options.maxChars=15000] - Cap extracted text length
 * @returns {{ title: string, description: string, cleanedText: string, wordCount: number, characterCount: number }}
 */
export function cleanHtml(rawHtml, options = {}) {
  const { maxChars = 15000 } = options;

  if (!rawHtml || typeof rawHtml !== 'string') {
    return { title: '', description: '', cleanedText: '', wordCount: 0, characterCount: 0 };
  }

  const $ = cheerio.load(rawHtml);

  // 1. Extract metadata
  const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled Page';
  const description = $('meta[name="description"]').attr('content')?.trim() || '';

  // 2. Remove noise tags
  NOISE_TAGS.forEach(tag => $(tag).remove());
  NOISE_SELECTORS.forEach(selector => $(selector).remove());

  // 3. Format structured blocks with line breaks
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    $(el).prepend('\n\n### ').append('\n');
  });

  $('p, article, section, div.content, main').each((_, el) => {
    $(el).append('\n');
  });

  $('li').each((_, el) => {
    $(el).prepend('• ').append('\n');
  });

  $('br').replaceWith('\n');

  // 4. Extract text from body (or whole document if no body)
  const root = $('body').length > 0 ? $('body') : $.root();
  let rawText = root.text();

  // 5. Clean up whitespace
  let text = rawText
    .replace(/[ \t]+/g, ' ')               // Collapse horizontal spaces
    .replace(/(\r?\n\s*){3,}/g, '\n\n')    // Collapse multiple blank lines
    .trim();

  // 6. Enforce character ceiling
  if (text.length > maxChars) {
    text = text.substring(0, maxChars) + '\n...[Content truncated for length]';
  }

  const words = text ? text.split(/\s+/).filter(Boolean) : [];

  return {
    title,
    description,
    cleanedText: text,
    wordCount: words.length,
    characterCount: text.length
  };
}

export default {
  cleanHtml
};
