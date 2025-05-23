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
    const languageTags = acceptLanguage.replaceAll(' ', '').split(',');
    const supportedLanguagesWithPriority: { language: string; priority: number }[] = [];

    for (const tag of languageTags) {
        if (!tag) continue;

        // Parse language and quality value
        const [languagePart, qualityPart] = tag.split(';q=');
        const languageCode = languagePart?.split('-')[0]?.toLowerCase();

        if (!languageCode || !supportedLanguages.includes(languageCode)) {
            continue;
        }

        // Parse quality value (default to 1.0 if not specified)
        let priority = 1.0;
        if (qualityPart) {
            const qualityValue = parseFloat(qualityPart);
            if (!isNaN(qualityValue)) {
                priority = qualityValue;
            }
        }

        supportedLanguagesWithPriority.push({ language: languageCode, priority });
    }

    if (supportedLanguagesWithPriority.length === 0) {
        return 'en';
    }

    // Sort by priority (highest first), then by order of appearance (stable sort)
    supportedLanguagesWithPriority.sort((a, b) => b.priority - a.priority);

    return supportedLanguagesWithPriority[0]?.language || 'en';
}
