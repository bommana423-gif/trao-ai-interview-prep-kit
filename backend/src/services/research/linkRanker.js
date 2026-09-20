import * as cheerio from 'cheerio';

// Semantic keyword groups and weights
const RELEVANCE_RULES = [
  // High Yield: Careers & Hiring
  {
    category: 'CAREERS',
    weight: 50,
    keywords: [
      'career', 'careers', 'job', 'jobs', 'hiring', 'work-with-us', 
      'join-us', 'join-our-team', 'open-positions', 'openings', 
      'opportunities', 'employment', 'apply'
    ]
  },
  // High Yield: Engineering & Architecture
  {
    category: 'ENGINEERING',
    weight: 45,
    keywords: [
      'engineering', 'tech-blog', 'engineering-blog', 'technology', 
      'architecture', 'stack', 'tech-stack', 'developer', 'dev-blog', 
      'open-source', 'infrastructure', 'research'
    ]
  },
  // High Yield: Culture, Interview Process & Leadership
  {
    category: 'CULTURE_INTERVIEW',
    weight: 35,
    keywords: [
      'interview', 'how-we-hire', 'hiring-process', 'culture', 
      'values', 'principles', 'life-at', 'our-team', 'people'
    ]
  },
  // Medium Yield: About & Company Mission
  {
    category: 'ABOUT',
    weight: 25,
    keywords: [
      'about', 'about-us', 'company', 'our-story', 'mission', 
      'leadership', 'founders', 'overview'
    ]
  },
  // Negative Yield: Low-value or distracting paths
  {
    category: 'IRRELEVANT',
    weight: -60,
    keywords: [
      'privacy', 'terms', 'tos', 'legal', 'cookie', 'cookies',
      'login', 'signin', 'signup', 'register', 'auth', 'cart',
      'checkout', 'billing', 'pricing', 'subscribe', 'forgot-password',
      'status', 'download', 'press-kit', 'media-kit', 'brand',
      'investor', 'investors', 'shareholder', 'contact', 'support', 'help'
    ]
  }
];

// File extensions to ignore
const IGNORED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.dmg', '.exe', '.apk',
  '.mp4', '.mp3', '.avi', '.mov', '.webm',
  '.css', '.js', '.map', '.woff', '.woff2', '.ttf', '.eot',
  '.json', '.xml', '.rss'
]);

/**
 * Score a URL and its anchor text for interview preparation relevance
 */
export function scoreLink(urlStr, anchorText = '') {
  let score = 0;
  let detectedCategory = 'GENERAL';

  const lowerUrl = urlStr.toLowerCase();
  const lowerText = anchorText.toLowerCase().trim();

  for (const rule of RELEVANCE_RULES) {
    let matched = false;

    for (const keyword of rule.keywords) {
      // Check in URL path
      if (lowerUrl.includes(keyword)) {
        score += rule.weight;
        matched = true;
      }
      // Check in Anchor Text (gives extra discovery power for non-standard slugs like /p/4092)
      if (lowerText.includes(keyword)) {
        score += rule.weight * 1.2; // 20% bonus for explicit user-facing link label
        matched = true;
      }
    }

    if (matched && rule.weight > 0 && detectedCategory === 'GENERAL') {
      detectedCategory = rule.category;
    }
  }

  // Bonus for concise, informative anchor texts
  if (lowerText.length > 3 && lowerText.length < 40) {
    score += 5;
  }

  return { score: Math.round(score), category: detectedCategory };
}

/**
 * Extract, resolve relative URLs, and rank all links from an HTML document
 * 
 * @param {string} html - Raw HTML of the page
 * @param {string} baseUrl - Current URL (for relative link resolution)
 * @param {object} [options]
 * @param {boolean} [options.sameOriginOnly=true] - Only keep links on same domain/subdomain
 * @returns {Array<{ url: string, text: string, score: number, category: string }>}
 */
export function extractAndRankLinks(html, baseUrl, options = {}) {
  const { sameOriginOnly = true } = options;
  const $ = cheerio.load(html);
  const baseParsed = new URL(baseUrl);
  const baseHostname = baseParsed.hostname.toLowerCase();

  const seenUrls = new Set();
  const rankedLinks = [];

  $('a[href]').each((_, el) => {
    const rawHref = $(el).attr('href')?.trim();
    const anchorText = $(el).text().replace(/\s+/g, ' ').trim();

    if (!rawHref) {
      return;
    }

    // Filter out pseudo-protocols
    if (
      rawHref.startsWith('javascript:') ||
      rawHref.startsWith('mailto:') ||
      rawHref.startsWith('tel:') ||
      rawHref.startsWith('#') ||
      rawHref.startsWith('data:')
    ) {
      return;
    }

    // Follow relative links using URL resolution
    let resolvedUrl;
    try {
      resolvedUrl = new URL(rawHref, baseUrl);
    } catch {
      return; // Malformed URL
    }

    // Only allow HTTP/HTTPS
    if (resolvedUrl.protocol !== 'http:' && resolvedUrl.protocol !== 'https:') {
      return;
    }

    // Strip hash fragments and trailing slashes for clean deduplication
    resolvedUrl.hash = '';
    const cleanUrl = resolvedUrl.href.replace(/\/$/, '');

    // Skip self-links to current page
    if (cleanUrl === baseUrl.replace(/\/$/, '')) {
      return;
    }

    // Check file extension
    const pathname = resolvedUrl.pathname.toLowerCase();
    const lastDot = pathname.lastIndexOf('.');
    if (lastDot !== -1) {
      const ext = pathname.substring(lastDot);
      if (IGNORED_EXTENSIONS.has(ext)) {
        return;
      }
    }

    // Domain / Origin check
    const linkHostname = resolvedUrl.hostname.toLowerCase();
    const isSameDomain = 
      linkHostname === baseHostname || 
      linkHostname.endsWith(`.${baseHostname}`) ||
      baseHostname.endsWith(`.${linkHostname}`);

    // Allow known reputable job board hosts (Greenhouse, Lever, Workday)
    const isKnownAts = 
      linkHostname.includes('greenhouse.io') ||
      linkHostname.includes('lever.co') ||
      linkHostname.includes('myworkdayjobs.com');

    if (sameOriginOnly && !isSameDomain && !isKnownAts) {
      return;
    }

    if (seenUrls.has(cleanUrl)) {
      return;
    }
    seenUrls.add(cleanUrl);

    const { score, category } = scoreLink(cleanUrl, anchorText);

    rankedLinks.push({
      url: cleanUrl,
      text: anchorText || 'Link',
      score,
      category,
      isSameDomain
    });
  });

  // Sort descending by relevance score
  rankedLinks.sort((a, b) => b.score - a.score);

  return rankedLinks;
}

export default {
  scoreLink,
  extractAndRankLinks
};
