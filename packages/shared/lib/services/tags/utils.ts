import type { Tags } from '@nangohq/types';

const TAG_KEY_MAX_LENGTH = 64;
const TAG_VALUE_MAX_LENGTH = 200;
const TAG_MAX_COUNT = 64;
const TAG_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_\-:./]*$/;
const TAG_VALUE_PATTERN = /^[a-zA-Z0-9_\-:./]*$/;

/**
 * Normalizes tag keys and values to lowercase.
 * Returns an error if normalization would create duplicate keys.
 */
export function normalizeTags(tags: Record<string, string>): { success: true; tags: Tags } | { success: false; error: string } {
    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(tags)) {
        const normalizedKey = key.toLowerCase();
        if (normalizedKey in normalized) {
            return {
                success: false,
                error: `Duplicate tag key after case normalization: "${normalizedKey}"`
            };
        }
        normalized[normalizedKey] = value.toLowerCase();
    }

    return { success: true, tags: normalized };
}

/**
 * Validates and normalizes tags.
 * Returns the normalized tags (lowercase keys and values) on success.
 */
export function validateTags(tags: Tags): { valid: true; tags: Tags } | { valid: false; error: string } {
    const entries = Object.entries(tags);

    if (entries.length > TAG_MAX_COUNT) {
        return { valid: false, error: `Tags cannot contain more than ${TAG_MAX_COUNT} keys` };
    }

    for (const [key, value] of entries) {
        if (key.length > TAG_KEY_MAX_LENGTH || !TAG_KEY_PATTERN.test(key)) {
            return {
                valid: false,
                error: `Tag keys must start with a letter, be at most ${TAG_KEY_MAX_LENGTH} characters, and contain only alphanumerics, underscores, hyphens, colons, periods, or slashes`
            };
        }
        if (value.length > TAG_VALUE_MAX_LENGTH || !TAG_VALUE_PATTERN.test(value)) {
            return {
                valid: false,
                error: `Tag values must be at most ${TAG_VALUE_MAX_LENGTH} characters and contain only alphanumerics, underscores, hyphens, colons, periods, or slashes`
            };
        }
    }

    const normalizeResult = normalizeTags(tags as Record<string, string>);
    if (!normalizeResult.success) {
        return { valid: false, error: normalizeResult.error };
    }

    return { valid: true, tags: normalizeResult.tags };
}
