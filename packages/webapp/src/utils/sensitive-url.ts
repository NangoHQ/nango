const REDACTED = '[redacted]';

// A token stops at URL delimiters ('?#&'), whitespace, quotes and semicolons (so a token inside
// an $elements_chain stops at its delimiter), and ':' (so parameterized route names like
// Sentry's /reset-password/:token transaction stay readable).
const BOUNDARY = String.raw`[/?#&:\s"';]`;
const TOKEN_SEGMENT = String.raw`[^/?#&:\s"';]+`;

// The negative lookaheads keep the bare /verify-email/ and /signup/ rules from treating the
// static `expired` and `verification` segments as tokens. Case-insensitive: react-router
// matches routes case-insensitively, so /Signup/<token> serves the page too.
const SENSITIVE_PATH_PATTERNS = [
    new RegExp(String.raw`(/reset-password/)${TOKEN_SEGMENT}`, 'gi'),
    new RegExp(String.raw`(/signup/verification/)${TOKEN_SEGMENT}`, 'gi'),
    new RegExp(String.raw`(/verify-email/expired/)${TOKEN_SEGMENT}`, 'gi'),
    new RegExp(String.raw`(/verify-email/)(?!expired(?:${BOUNDARY}|$))${TOKEN_SEGMENT}`, 'gi'),
    new RegExp(String.raw`(/signup/)(?!verification(?:${BOUNDARY}|$))${TOKEN_SEGMENT}`, 'gi'),
    // The API calls those pages make carry the same tokens in the path.
    new RegExp(String.raw`(/api/v1/invite/)${TOKEN_SEGMENT}`, 'gi'),
    new RegExp(String.raw`(/api/v1/account/email/expired-token/)${TOKEN_SEGMENT}`, 'gi'),
    new RegExp(String.raw`(/api/v1/account/email/)(?!expired-token(?:${BOUNDARY}|$))${TOKEN_SEGMENT}`, 'gi')
];

// Signin carries the invite token in ?next=/signup/<token>, raw or percent-encoded.
const NEXT_PARAM_PATTERN = /(next=(?:%2F|\/)signup(?:%2F|\/))[^&#\s"';]+/gi;

// No leading \b: a percent-encoded delimiter ends in a word char ('%2F'), which defeats it.
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g;

// Every string the patterns above can match contains one of these, so skipping on a miss can
// never skip a redaction. Keep that true when adding a pattern: no delimiters, they vary by
// encoding and case (`/signup/`, `%2Fsignup%2F`, `%2fsignup/`, …).
const HINTS = ['reset-password', 'email', 'signup', 'invite', 'eyj'];

/**
 * Removes auth tokens from URLs and URL-shaped strings before they reach PostHog or Sentry.
 * Query params are handled separately by PostHog's `custom_personal_data_properties`.
 */
export function redactSensitiveText(value: string): string {
    if (!value) {
        return value;
    }

    const haystack = value.toLowerCase();
    if (!HINTS.some((hint) => haystack.includes(hint))) {
        return value;
    }

    let redacted = value;
    for (const pattern of SENSITIVE_PATH_PATTERNS) {
        redacted = redacted.replace(pattern, `$1${REDACTED}`);
    }
    redacted = redacted.replace(NEXT_PARAM_PATTERN, `$1${REDACTED}`);

    return redacted.replace(JWT_PATTERN, REDACTED);
}

/** Mutates in place: callers (PostHog capture hooks, Sentry before-send) own the object. */
export function redactSensitiveProperties(properties: Record<string, unknown> | undefined): void {
    if (!properties) {
        return;
    }

    for (const [key, value] of Object.entries(properties)) {
        if (typeof value === 'string') {
            properties[key] = redactSensitiveText(value);
        } else if (key === '$elements' && Array.isArray(value)) {
            // Autocapture puts anchor hrefs here; `mask_all_element_attributes` doesn't cover them.
            for (const element of value) {
                if (element && typeof element === 'object') {
                    redactSensitiveProperties(element as Record<string, unknown>);
                }
            }
        }
    }
}
