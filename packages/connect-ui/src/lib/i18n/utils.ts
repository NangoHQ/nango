import type { Language } from './context';

export const detectLanguage = (): Language => {
    const browserLang = navigator.language.split('-')[0];
    const supportedLanguages: Language[] = ['en', 'fr']; // Add all supported languages

    return supportedLanguages.includes(browserLang as Language) ? (browserLang as Language) : 'en'; // Default fallback
};

/**
 * Get a value from a nested object using dot notation
 * @param obj The object to search in
 * @param path The path to the value using dot notation (e.g., 'common.button.submit')
 * @returns The value if found, null otherwise
 */
export const getNestedValue = (obj: Record<string, unknown> | null | undefined, path: string): unknown => {
    if (!obj) return null;

    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
        if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[key];
        } else {
            return null;
        }
    }

    return current;
};

/**
 * Format a string with named placeholders
 * @param str The string to format with placeholders like {name}, {id}, etc.
 * @param replacements Object with keys matching the placeholder names
 * @returns Formatted string
 */
export const formatTemplateString = (str: string, replacements?: Record<string, string | number>): string => {
    if (!replacements) return str;

    return str.replace(/{([^{}]+)}/g, (match, key) => {
        const value = replacements[key];
        return value !== undefined ? String(value) : match;
    });
};
