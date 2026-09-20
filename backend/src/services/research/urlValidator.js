import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Check if an IPv4 address is in a private, loopback, or reserved range
 */
export function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP, treat as unsafe
  }

  const [a, b] = parts;

  // 127.0.0.0/8 - Loopback
  if (a === 127) {
    return { isPrivate: true, type: 'LOOPBACK' };
  }

  // 169.254.0.0/16 - Link-local / Cloud Metadata (e.g. AWS 169.254.169.254)
  if (a === 169 && b === 254) {
    return { isPrivate: true, type: 'CLOUD_METADATA' };
  }

  // 10.0.0.0/8 - RFC 1918 Private
  if (a === 10) {
    return { isPrivate: true, type: 'RFC1918_PRIVATE' };
  }

  // 172.16.0.0/12 - RFC 1918 Private
  if (a === 172 && b >= 16 && b <= 31) {
    return { isPrivate: true, type: 'RFC1918_PRIVATE' };
  }

  // 192.168.0.0/16 - RFC 1918 Private
  if (a === 192 && b === 168) {
    return { isPrivate: true, type: 'RFC1918_PRIVATE' };
  }

  // 0.0.0.0/8 - Current Network
  if (a === 0) {
    return { isPrivate: true, type: 'CURRENT_NETWORK' };
  }

  // 100.64.0.0/10 - Carrier-grade NAT
  if (a === 100 && b >= 64 && b <= 127) {
    return { isPrivate: true, type: 'SHARED_ADDRESS' };
  }

  // 224.0.0.0/4 & 240.0.0.0/4 - Multicast & Reserved
  if (a >= 224) {
    return { isPrivate: true, type: 'RESERVED_MULTICAST' };
  }

  return { isPrivate: false, type: 'PUBLIC' };
}

/**
 * Check if an IPv6 address is loopback, unique local, or link-local
 */
export function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase();

  // Loopback ::1
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') {
    return { isPrivate: true, type: 'LOOPBACK' };
  }

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.substring(7);
    if (net.isIPv4(ipv4Part)) {
      return isPrivateIPv4(ipv4Part);
    }
  }

  // fe80::/10 - Link-local
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return { isPrivate: true, type: 'LINK_LOCAL' };
  }

  // fc00::/7 - Unique local address (fc00:: or fd00::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return { isPrivate: true, type: 'UNIQUE_LOCAL' };
  }

  return { isPrivate: false, type: 'PUBLIC' };
}

/**
 * Validates a target company URL and guards against SSRF
 * 
 * @param {string} inputUrl - The raw URL string
 * @param {object} options
 * @param {boolean} options.allowLocalhost - If true, permits localhost/127.0.0.1 (used by batch evaluator)
 * @returns {Promise<{ isValid: boolean, normalizedUrl?: string, error?: string, ip?: string }>}
 */
export async function validateAndNormalizeUrl(inputUrl, options = {}) {
  const { allowLocalhost = false } = options;

  if (!inputUrl || typeof inputUrl !== 'string') {
    return { isValid: false, error: 'URL must be a non-empty string.' };
  }

  let parsed;
  try {
    // Automatically add https:// only if user provided plain domain without any scheme (e.g. "stripe.com")
    let toParse = inputUrl.trim();
    if (!toParse.includes('://')) {
      toParse = `https://${toParse}`;
    }
    parsed = new URL(toParse);
  } catch {
    return { isValid: false, error: 'Invalid URL structure.' };
  }

  // 1. Protocol validation: strictly http or https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isValid: false, error: `Disallowed protocol: "${parsed.protocol}". Only HTTP and HTTPS are permitted.` };
  }

  // 2. Reject credentials in URL (e.g. https://user:pass@example.com)
  if (parsed.username || parsed.password) {
    return { isValid: false, error: 'URLs containing embedded user credentials are not permitted.' };
  }

  const rawHostname = parsed.hostname.toLowerCase();
  const cleanHostname = rawHostname.replace(/^\[|\]$/g, '');
  const hostname = cleanHostname;

  // 3. Check for obvious localhost / loopback names
  const isLoopbackHost = 
    cleanHostname === 'localhost' || 
    cleanHostname.endsWith('.localhost') || 
    cleanHostname === '127.0.0.1' || 
    cleanHostname === '::1' ||
    cleanHostname.startsWith('127.');

  if (isLoopbackHost) {
    if (allowLocalhost) {
      return {
        isValid: true,
        normalizedUrl: parsed.href,
        ip: cleanHostname === '::1' ? '::1' : '127.0.0.1',
        isLocal: true
      };
    } else {
      return { isValid: false, error: 'Access to loopback/localhost addresses is restricted for security.' };
    }
  }

  // 4. If hostname is directly an IP address
  if (net.isIP(cleanHostname)) {
    const ipCheck = net.isIPv4(cleanHostname) ? isPrivateIPv4(cleanHostname) : isPrivateIPv6(cleanHostname);
    if (ipCheck.isPrivate) {
      if (ipCheck.type === 'LOOPBACK' && allowLocalhost) {
        return { isValid: true, normalizedUrl: parsed.href, ip: cleanHostname, isLocal: true };
      }
      return { isValid: false, error: `Access to private IP range (${ipCheck.type}) is blocked for SSRF protection.` };
    }
    return { isValid: true, normalizedUrl: parsed.href, ip: cleanHostname };
  }

  // 5. DNS Pre-Resolution: Check what the hostname resolves to
  try {
    const addresses = await dns.resolve4(hostname);
    if (!addresses || addresses.length === 0) {
      return { isValid: false, error: `Could not resolve hostname: ${hostname}` };
    }

    // Check all resolved IP addresses
    for (const addr of addresses) {
      const check = isPrivateIPv4(addr);
      if (check.isPrivate) {
        if (check.type === 'LOOPBACK' && allowLocalhost) {
          continue;
        }
        return {
          isValid: false,
          error: `Hostname ${hostname} resolves to restricted IP ${addr} (${check.type}). Blocked for SSRF protection.`
        };
      }
    }

    return {
      isValid: true,
      normalizedUrl: parsed.href,
      ip: addresses[0]
    };
  } catch (dnsErr) {
    // In local evaluation testing, mock domains or local test fixtures might not have DNS
    if (allowLocalhost && (hostname.includes('test') || hostname.includes('local'))) {
      return { isValid: true, normalizedUrl: parsed.href, ip: '127.0.0.1', isLocal: true };
    }
    return { isValid: false, error: `DNS resolution failed for ${hostname}: ${dnsErr.code || dnsErr.message}` };
  }
}

export default {
  isPrivateIPv4,
  isPrivateIPv6,
  validateAndNormalizeUrl
};
