/**
 * In-memory cache for robots.txt rules by origin
 * Maps origin -> { rules: [{ disallow: string, allow: string }], crawlDelay: number, fetchedAt: number }
 */
const robotsCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Parse raw robots.txt text into structured rules for User-agent: *
 */
export function parseRobotsTxt(content) {
  const lines = content.split(/\r?\n/);
  const disallows = [];
  const allows = [];
  let isTargetAgent = false;
  let crawlDelay = 0;

  for (let line of lines) {
    // Strip comments
    const commentIndex = line.indexOf('#');
    if (commentIndex !== -1) {
      line = line.substring(0, commentIndex);
    }
    line = line.trim();
    if (!line) {
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const directive = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();

    if (directive === 'user-agent') {
      const agent = value.toLowerCase();
      // Match wildcard * or custom Trao bot
      isTargetAgent = agent === '*' || agent.includes('trao');
    } else if (isTargetAgent) {
      if (directive === 'disallow') {
        if (value) {
          disallows.push(value);
        }
      } else if (directive === 'allow') {
        if (value) {
          allows.push(value);
        }
      } else if (directive === 'crawl-delay') {
        const delay = parseFloat(value);
        if (!isNaN(delay)) {
          crawlDelay = delay;
        }
      }
    }
  }

  return { disallows, allows, crawlDelay };
}

/**
 * Check if a path is allowed given parsed rules
 */
export function isAllowedByRules(pathname, { disallows, allows }) {
  // Allow rules take precedence if longer or equal length
  for (const allowPattern of allows) {
    if (pathname.startsWith(allowPattern)) {
      return true;
    }
  }

  for (const disallowPattern of disallows) {
    if (disallowPattern === '/') {
      return false; // Entire site blocked
    }
    if (pathname.startsWith(disallowPattern)) {
      return false;
    }
  }

  return true;
}

/**
 * Fetch and check if target URL is permitted by site's robots.txt
 * 
 * @param {string} targetUrl 
 * @param {object} [fetchOptions]
 * @returns {Promise<{ allowed: boolean, reason?: string, crawlDelay?: number }>}
 */
export async function checkRobotsPermission(targetUrl, fetchOptions = {}) {
  try {
    const parsed = new URL(targetUrl);
    const origin = parsed.origin;
    const now = Date.now();

    // Check cache
    if (robotsCache.has(origin)) {
      const cached = robotsCache.get(origin);
      if (now - cached.fetchedAt < CACHE_TTL_MS) {
        const allowed = isAllowedByRules(parsed.pathname, cached.rules);
        return { allowed, crawlDelay: cached.rules.crawlDelay };
      }
    }

    const robotsUrl = `${origin}/robots.txt`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), fetchOptions.timeout || 3000);

    let rules = { disallows: [], allows: [], crawlDelay: 0 };

    try {
      const response = await fetch(robotsUrl, {
        headers: {
          'User-Agent': 'TraoResearchBot/1.0 (+https://trao.ai/bot)'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const text = await response.text();
        rules = parseRobotsTxt(text);
      }
    } catch {
      // If robots.txt cannot be reached or times out, default to permissive standard
      clearTimeout(timeoutId);
    }

    robotsCache.set(origin, { rules, fetchedAt: now });
    const allowed = isAllowedByRules(parsed.pathname, rules);

    return {
      allowed,
      crawlDelay: rules.crawlDelay,
      reason: allowed ? 'Permitted by robots.txt' : `Blocked by robots.txt disallow rule`
    };
  } catch {
    return { allowed: true };
  }
}

export default {
  parseRobotsTxt,
  isAllowedByRules,
  checkRobotsPermission
};
