import { createContext, useContext, useEffect, useState } from 'react';

import englishTranslation from './translations/en.js';
import { formatTemplateString, getNestedValue } from './utils.js';

import type { Translation } from './translations/en.js';
import type { Paths } from 'type-fest';

export type TranslationKey = Paths<typeof englishTranslation>;

// Define supported languages
export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const; // Add more as needed
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

interface I18nContextType {
    t: (key: TranslationKey, replacements?: Record<string, string | number>) => string;
    language: Language;
    setLanguage: (lang: Language) => void;
    isLoading: boolean;
}

const I18nContext = createContext<I18nContextType | null>(null);

/**
 * Provider component for internationalization
 * Manages loading translations and providing the translation function
 */
export const I18nProvider: React.FC<{
    children: React.ReactNode;
    defaultLanguage?: Language;
    language?: string;
}> = ({ children, defaultLanguage = 'en', language }) => {
    // Check if provided language is supported, otherwise use defaultLanguage
    const initialLanguage = language && (language === 'en' || language === 'fr') ? language : defaultLanguage;

    const [currentLanguage, setCurrentLanguage] = useState<Language>(initialLanguage);
    const [translations, setTranslations] = useState<Translation>(englishTranslation);
    const [isLoading, setIsLoading] = useState(true);

    // Load translations for the selected language when language changes
    useEffect(() => {
        // Skip the initial load for English since we already loaded it
        if (currentLanguage === 'en') {
            setTranslations(englishTranslation);
            setIsLoading(false);
            return;
        }

        const loadTranslations = async () => {
            setIsLoading(true);
            try {
                const module = await import(`../i18n/translations/${currentLanguage}.ts`);
                setTranslations(module.default);
            } catch (err) {
                console.error(`Failed to load translations for ${currentLanguage}`, err);
                setTranslations(englishTranslation);
            } finally {
                setIsLoading(false);
            }
        };

        void loadTranslations();
    }, [currentLanguage]);

    /**
     * Translates a key into the current language
     * Falls back to English if the key doesn't exist in the current language
     */
    const t = (key: string, replacements?: Record<string, string | number>): string => {
        // Try to get translation from current language
        const value = getNestedValue(translations, key);

        // Try to get the English fallback value in these cases:
        // 1. We're loading a non-English language (show English during loading)
        // 2. The key wasn't found in the current language
        let translatedString = key;

        if (typeof value === 'string') {
            // Use the value from current language if available
            translatedString = value;
        } else if ((isLoading && currentLanguage !== 'en') || value === null) {
            // In loading state or key not found, try English fallback
            const fallbackValue = getNestedValue(englishTranslation, key);
            if (typeof fallbackValue === 'string') {
                translatedString = fallbackValue;
            }
        }

        // Apply template replacements if provided
        if (replacements && Object.keys(replacements).length > 0) {
            return formatTemplateString(translatedString, replacements);
        }

        return translatedString;
    };

    return <I18nContext.Provider value={{ t, language: currentLanguage, setLanguage: setCurrentLanguage, isLoading }}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextType => {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useI18n must be used within an I18nProvider');
    }
    return context;
};
