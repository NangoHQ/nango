import { createContext, useContext, useEffect, useState } from 'react';

import { formatTemplateString, getNestedValue } from './utils';

// Define supported languages
export type Language = 'en' | 'fr'; // Add more as needed

// Translation object type
type TranslationsType = Record<string, Record<string, unknown>>;

interface I18nContextType {
    t: (key: string, replacements?: Record<string, string | number>) => string;
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
}> = ({ children, defaultLanguage = 'en' }) => {
    const [language, setLanguage] = useState<Language>(defaultLanguage);
    const [translations, setTranslations] = useState<TranslationsType>({});
    const [fallbackTranslations, setFallbackTranslations] = useState<TranslationsType>({});
    const [isLoading, setIsLoading] = useState(true);
    const [initialEnglishLoaded, setInitialEnglishLoaded] = useState(false);

    // Immediately load English translations at startup
    useEffect(() => {
        const loadInitialEnglish = async () => {
            try {
                const module = await import(`../i18n/translations/en.ts`);
                setFallbackTranslations(module.default);
                setInitialEnglishLoaded(true);

                // If the default language is English, also set as main translations
                if (language === 'en') {
                    setTranslations(module.default);
                    setIsLoading(false);
                }
            } catch (err) {
                console.error('Failed to load initial English translations', err);
                setFallbackTranslations({});
            }
        };

        void loadInitialEnglish();
    }, [language]); // Include language in the dependency array

    // Load translations for the selected language when language changes
    useEffect(() => {
        // Skip the initial load for English since we already loaded it
        if (language === 'en' && initialEnglishLoaded) {
            setTranslations(fallbackTranslations);
            setIsLoading(false);
            return;
        }

        const loadTranslations = async () => {
            setIsLoading(true);
            try {
                const module = await import(`../i18n/translations/${language}.ts`);
                setTranslations(module.default);
            } catch (err) {
                console.error(`Failed to load translations for ${language}`, err);
                setTranslations({});
            } finally {
                setIsLoading(false);
            }
        };

        void loadTranslations();
    }, [language, initialEnglishLoaded, fallbackTranslations]);

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
        } else if ((isLoading && language !== 'en') || value === null) {
            // In loading state or key not found, try English fallback
            const fallbackValue = getNestedValue(fallbackTranslations, key);
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

    return <I18nContext.Provider value={{ t, language, setLanguage, isLoading }}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextType => {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useI18n must be used within an I18nProvider');
    }
    return context;
};
