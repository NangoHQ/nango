import type { NextFunction, Request, Response } from 'express';

const supportedLanguages = ['en', 'es', 'fr', 'de'];

export function acceptLanguageMiddleware(req: Request, res: Response, next: NextFunction) {
    const acceptLanguage = req.headers['accept-language'] as string;
    const preferredLanguage = parseAcceptLanguage(acceptLanguage);
    res.locals['lang'] = preferredLanguage;
    next();
}

export function parseAcceptLanguage(acceptLanguage?: string): string {
    if (!acceptLanguage) {
        return 'en';
    }

    // Split by comma and process each language tag
    const languageTags = acceptLanguage.split(',').map((tag) => tag.trim());

    for (const tag of languageTags) {
        if (!tag) continue;

        // Extract language code (ignore quality values and country codes)
        // e.g., "es-ES;q=0.9" -> "es", "fr" -> "fr"
        const languageCode = tag.split(';')[0]?.split('-')[0]?.toLowerCase();

        if (languageCode && supportedLanguages.includes(languageCode)) {
            return languageCode;
        }
    }

    // Default to English if no supported language found
    return 'en';
}
