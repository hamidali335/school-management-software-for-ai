let app: any;
try {
  app = require('electron').app;
} catch {}

export const PRODUCTION_DEFAULT_CLOUD_URL = 'https://smsapi.teachassist.site/api/v1';
export const DEVELOPMENT_DEFAULT_CLOUD_URL = 'http://localhost:4000/api/v1';

/**
 * Authoritative default API endpoint resolution.
 * Localhost is only permitted in unpackaged development builds.
 * Packaged builds default to PRODUCTION_DEFAULT_CLOUD_URL unless overridden by technician.
 */
export function getDefaultCloudApiBaseUrl(): string {
  const isDev = typeof app !== 'undefined' && !app.isPackaged;
  return isDev ? DEVELOPMENT_DEFAULT_CLOUD_URL : PRODUCTION_DEFAULT_CLOUD_URL;
}

/**
 * Validates target cloud endpoint URL syntax, protocol, and transport security.
 * STRICT: Forbids 'http:' and loopback/localhost in packaged production builds.
 */
export function validateCloudApiUrl(url: string): { valid: boolean; error?: string; cleanUrl?: string } {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return { valid: false, error: 'Cloud backend URL is required' };
  }

  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: `Invalid URL format. Example: ${PRODUCTION_DEFAULT_CLOUD_URL}` };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Protocol must be http: or https:' };
  }

  const isPackaged = typeof app !== 'undefined' && app.isPackaged;
  if (isPackaged) {
    if (parsed.protocol === 'http:') {
      return { valid: false, error: 'Insecure HTTP endpoints are not permitted in production. Please use HTTPS.' };
    }
    const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
    if (isLoopback) {
      return { valid: false, error: 'Localhost endpoints are strictly forbidden in production builds.' };
    }
  }

  const cleanUrl = trimmed.replace(/\/+$/, '');
  return { valid: true, cleanUrl };
}
