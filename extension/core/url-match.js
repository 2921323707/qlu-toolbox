export const ELIGIBILITY_REASONS = Object.freeze({
  ELIGIBLE: 'eligible',
  INVALID_MODULE: 'invalid-module',
  INVALID_URL: 'invalid-url',
  RESTRICTED_URL: 'restricted-url',
  HTTPS_REQUIRED: 'https-required',
  ORIGIN_MISMATCH: 'origin-mismatch',
  PATH_MISMATCH: 'path-mismatch',
  QUERY_MISMATCH: 'query-mismatch',
});

const results = Object.freeze(
  Object.fromEntries(
    Object.values(ELIGIBILITY_REASONS).map((reason) => [
      reason,
      Object.freeze({ eligible: reason === ELIGIBILITY_REASONS.ELIGIBLE, reason }),
    ]),
  ),
);

const restrictedProtocols = new Set([
  'about:',
  'blob:',
  'chrome:',
  'chrome-extension:',
  'data:',
  'devtools:',
  'edge:',
  'file:',
  'javascript:',
  'moz-extension:',
  'view-source:',
]);

function result(reason) {
  return results[reason] || results[ELIGIBILITY_REASONS.INVALID_URL];
}

function isMatchConfig(value) {
  return Boolean(
    value
      && typeof value.origin === 'string'
      && typeof value.pathPrefix === 'string'
      && value.query
      && typeof value.query === 'object',
  );
}

function hasSegmentPrefix(pathname, pathPrefix) {
  if (!pathPrefix.startsWith('/')) return false;
  const base = pathPrefix.length > 1 && pathPrefix.endsWith('/')
    ? pathPrefix.slice(0, -1)
    : pathPrefix;
  return pathname === base || pathname.startsWith(`${base}/`);
}

function hasExactQueryValues(searchParams, expectedQuery) {
  for (const [key, expectedValue] of Object.entries(expectedQuery)) {
    const values = searchParams.getAll(key);
    if (values.length !== 1 || values[0] !== String(expectedValue)) return false;
  }
  return true;
}

export function evaluateUrlEligibility(module, rawUrl) {
  if (!module || !isMatchConfig(module.matches)) {
    return result(ELIGIBILITY_REASONS.INVALID_MODULE);
  }

  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return result(ELIGIBILITY_REASONS.INVALID_URL);
  }

  let url;
  let expectedOrigin;
  try {
    url = new URL(rawUrl);
    expectedOrigin = new URL(module.matches.origin);
  } catch {
    return result(ELIGIBILITY_REASONS.INVALID_URL);
  }

  if (restrictedProtocols.has(url.protocol)) {
    return result(ELIGIBILITY_REASONS.RESTRICTED_URL);
  }

  if (url.protocol !== 'https:' || expectedOrigin.protocol !== 'https:') {
    return result(ELIGIBILITY_REASONS.HTTPS_REQUIRED);
  }

  if (
    url.username
    || url.password
    || url.hostname !== expectedOrigin.hostname
    || url.port !== expectedOrigin.port
    || url.origin !== expectedOrigin.origin
  ) {
    return result(ELIGIBILITY_REASONS.ORIGIN_MISMATCH);
  }

  if (!hasSegmentPrefix(url.pathname, module.matches.pathPrefix)) {
    return result(ELIGIBILITY_REASONS.PATH_MISMATCH);
  }

  if (!hasExactQueryValues(url.searchParams, module.matches.query)) {
    return result(ELIGIBILITY_REASONS.QUERY_MISMATCH);
  }

  return result(ELIGIBILITY_REASONS.ELIGIBLE);
}

export function isRestrictedEligibilityReason(reason) {
  return reason === ELIGIBILITY_REASONS.INVALID_URL
    || reason === ELIGIBILITY_REASONS.RESTRICTED_URL;
}
