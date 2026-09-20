import { validateAndNormalizeUrl } from './urlValidator.js';
import { checkRobotsPermission } from './robotsParser.js';
import { extractAndRankLinks } from './linkRanker.js';
import { cleanHtml } from './htmlCleaner.js';
import { formatResearchForLLM } from './promptSanitizer.js';

// Configuration defaults
const DEFAULT_TIMEOUT_MS = 4000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB limit
const DEFAULT_MAX_PAGES = 4;
const DEFAULT_MAX_DEPTH = 2;
const USER_AGENT = 'TraoResearchBot/1.0 (+https://trao.ai/bot)';

/**
 * Perform an HTTP GET request with timeouts, byte limit enforcement, and retry with exponential backoff
 */
export async function safeFetch(url, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT_MS,
    maxBytes = MAX_RESPONSE_BYTES,
    maxRetries = 2,
    allowLocalhost = false
  } = options;

  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    // 1. SSRF Pre-flight Validation
    const validation = await validateAndNormalizeUrl(url, { allowLocalhost });
    if (!validation.isValid) {
      return {
        success: false,
        url,
        reason: validation.error || 'Blocked by SSRF security policy',
        fatal: true // Do not retry security rejections
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(validation.normalizedUrl, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // 2. Check HTTP Status
      if (!response.ok) {
        const isTransient = [408, 429, 500, 502, 503, 504].includes(response.status);
        if (isTransient && attempt < maxRetries) {
          attempt++;
          const delay = Math.min(2000, 300 * Math.pow(2, attempt)) + Math.random() * 100;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return {
          success: false,
          url,
          statusCode: response.status,
          reason: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      // 3. Check Content-Type (Ignore unsupported media, binaries, pdfs)
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        return {
          success: false,
          url,
          statusCode: response.status,
          reason: `Unsupported content-type: "${contentType}". Only HTML pages are crawled.`,
          unsupportedType: true
        };
      }

      // 4. Check Content-Length header before reading full body
      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader && parseInt(contentLengthHeader, 10) > maxBytes) {
        return {
          success: false,
          url,
          reason: `Response exceeded max allowed size of ${maxBytes} bytes (Content-Length: ${contentLengthHeader}).`
        };
      }

      // 5. Read response body with byte ceiling
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > maxBytes) {
        return {
          success: false,
          url,
          reason: `Response payload size (${arrayBuffer.byteLength} bytes) exceeded ${maxBytes} bytes.`
        };
      }

      const decoder = new TextDecoder('utf-8', { fatal: false });
      const html = decoder.decode(arrayBuffer);

      return {
        success: true,
        url: validation.normalizedUrl,
        finalUrl: response.url || validation.normalizedUrl,
        statusCode: response.status,
        html,
        bytes: arrayBuffer.byteLength
      };

    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;

      if (err.name === 'AbortError') {
        lastError = new Error(`Request timed out after ${timeout}ms.`);
      }

      if (attempt < maxRetries) {
        attempt++;
        const delay = Math.min(2000, 300 * Math.pow(2, attempt)) + Math.random() * 100;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      break;
    }
  }

  return {
    success: false,
    url,
    reason: lastError?.message || 'Network request failed'
  };
}

/**
 * Main Crawl Pipeline: Discovers, ranks, and distills company intelligence
 * 
 * @param {string} initialUrl - Starting company homepage or careers URL
 * @param {object} [options]
 * @param {number} [options.maxPages=4] - Max pages to crawl
 * @param {number} [options.maxDepth=2] - Max link hops from homepage
 * @param {number} [options.timeout=4000] - Request timeout in ms
 * @param {boolean} [options.allowLocalhost=false] - Permit localhost/127.0.0.1 for evaluator test fixtures
 * @param {boolean} [options.respectRobots=true] - Enforce robots.txt rules
 * @returns {Promise<{ companyUrl: string, pages: Array, failedSources: Array, totalWords: number, untrustedXml: string }>}
 */
export async function crawlCompany(initialUrl, options = {}) {
  const {
    maxPages = DEFAULT_MAX_PAGES,
    maxDepth = DEFAULT_MAX_DEPTH,
    timeout = DEFAULT_TIMEOUT_MS,
    allowLocalhost = false,
    respectRobots = true
  } = options;

  // Validate initial URL
  const initValidation = await validateAndNormalizeUrl(initialUrl, { allowLocalhost });
  if (!initValidation.isValid) {
    return {
      success: false,
      error: initValidation.error,
      pages: [],
      failedSources: [{ url: initialUrl, reason: initValidation.error }]
    };
  }

  const startUrl = initValidation.normalizedUrl;
  const visitedUrls = new Set();
  const failedSources = [];
  const crawledPages = [];

  // Priority queue: [{ url, depth, priorityScore }]
  const queue = [{ url: startUrl, depth: 0, priorityScore: 100 }];

  while (queue.length > 0 && crawledPages.length < maxPages) {
    // Pick the item with the highest priority score
    queue.sort((a, b) => b.priorityScore - a.priorityScore);
    const current = queue.shift();

    if (visitedUrls.has(current.url)) {
      continue;
    }
    visitedUrls.add(current.url);

    // 1. Check robots.txt if enabled
    if (respectRobots) {
      const robotsCheck = await checkRobotsPermission(current.url, { timeout: 2000 });
      if (!robotsCheck.allowed) {
        failedSources.push({
          url: current.url,
          reason: robotsCheck.reason || 'Blocked by site robots.txt policy'
        });
        continue;
      }
    }

    // 2. Fetch page content
    const fetchResult = await safeFetch(current.url, {
      timeout,
      allowLocalhost,
      maxRetries: 1
    });

    if (!fetchResult.success) {
      // Record failed source without failing entire kit
      failedSources.push({
        url: current.url,
        reason: fetchResult.reason,
        statusCode: fetchResult.statusCode || null
      });
      continue;
    }

    // 3. Clean and extract text
    const cleaned = cleanHtml(fetchResult.html);

    crawledPages.push({
      url: fetchResult.url,
      title: cleaned.title,
      description: cleaned.description,
      cleanedText: cleaned.cleanedText,
      wordCount: cleaned.wordCount,
      depth: current.depth
    });

    // 4. Discover and rank outbound links if within depth limit
    if (current.depth < maxDepth && crawledPages.length < maxPages) {
      const rankedLinks = extractAndRankLinks(fetchResult.html, fetchResult.url, { sameOriginOnly: true });

      // Add high-yield discovered pages to queue
      for (const link of rankedLinks) {
        if (!visitedUrls.has(link.url) && !queue.some(q => q.url === link.url)) {
          // Only queue links that have positive relevance score
          if (link.score > 0) {
            queue.push({
              url: link.url,
              depth: current.depth + 1,
              priorityScore: link.score
            });
          }
        }
      }
    }
  }

  // Format untrusted text securely for downstream LLM prompts
  const untrustedXml = formatResearchForLLM(crawledPages);
  const totalWords = crawledPages.reduce((acc, p) => acc + p.wordCount, 0);

  return {
    success: crawledPages.length > 0,
    companyUrl: startUrl,
    pagesCrawled: crawledPages.length,
    pages: crawledPages,
    failedSources,
    totalWords,
    untrustedXml
  };
}

export const crawlCompanyWebsite = crawlCompany;

export default {
  safeFetch,
  crawlCompany,
  crawlCompanyWebsite
};
