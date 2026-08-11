const REDACTED = '[redacted]';

// Quotes and semicolons are excluded so a token inside an $elements_chain stops at its delimiter.
const TOKEN_SEGMENT = String.raw`[^/?#\s"';]+`;

// Specific prefixes first, so the bare /signup/ and /verify-email/ rules can't swallow them.
const SENSITIVE_PATH_PATTERNS = [
    new RegExp(String.raw`(/reset-password/)${TOKEN_SEGMENT}`, 'g'),
    new RegExp(String.raw`(/signup/verification/)${TOKEN_SEGMENT}`, 'g'),
    new RegExp(String.raw`(/verify-email/expired/)${TOKEN_SEGMENT}`, 'g'),
    new RegExp(String.raw`(/verify-email/)(?!expired(?:/|$))${TOKEN_SEGMENT}`, 'g'),
    new RegExp(String.raw`(/signup/)(?!verification(?:/|$))${TOKEN_SEGMENT}`, 'g')
];

// Signin carries the invite token in ?next=/signup/<token>, raw or percent-encoded.
const NEXT_PARAM_PATTERN = /(next=(?:%2F|\/)signup(?:%2F|\/))[^&#\s"';]+/gi;

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g;

const HINTS = ['reset-password', 'verify-email', '/signup/', '%2Fsignup%2F', 'eyJ'];

/**
 * Removes auth tokens from URLs and URL-shaped strings before they reach PostHog or Sentry.
 * Query params are handled separately by PostHog's `custom_personal_data_properties`.
 */
export function redactSensitiveText(value: string): string {
    if (!value || !HINTS.some((hint) => value.includes(hint))) {
        return value;
    }

    let redacted = value;
    for (const pattern of SENSITIVE_PATH_PATTERNS) {
        redacted = redacted.replace(pattern, `$1${REDACTED}`);
    }
    redacted = redacted.replace(NEXT_PARAM_PATTERN, `$1${REDACTED}`);

    return redacted.replace(JWT_PATTERN, REDACTED);
}

/** Mutates in place: PostHog builds a fresh properties object per capture. */
export function redactSensitiveProperties(properties: Record<string, unknown>): void {
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
