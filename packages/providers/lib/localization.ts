import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Provider } from '@nangohq/types';

const __filename = fileURLToPath(import.meta.url);
const pkgRoot = path.join(__filename, '../../');

let overridesCache: Record<string, Record<string, any>> = {};

export function clearLocalizationCache(): void {
    overridesCache = {};
}

export function getLocalizedProviders(baseProviders: Record<string, Provider>, language: string): Record<string, Provider> {
    const languageOverrides = getLanguageOverrides(language);
    return applyLanguageOverrides(baseProviders, languageOverrides);
}

function getLanguageOverrides(language: string): Record<string, any> {
    if (overridesCache[language]) {
        return overridesCache[language];
    }

    const overrides = loadLanguageOverrides(language);
    overridesCache[language] = overrides;
    return overrides;
}

function loadLanguageOverrides(language: string): Record<string, any> {
    try {
        const languageFilePath = path.join(pkgRoot, 'i18n', `providers.${language}.json`);

        if (!fs.existsSync(languageFilePath)) {
            return {};
        }

        const fileContent = fs.readFileSync(languageFilePath, 'utf8');
        const overrides = JSON.parse(fileContent) as Record<string, any>;

        return overrides || {};
    } catch (err) {
        console.error(`Failed to load language overrides for ${language}`, err);
        return {};
    }
}

function applyLanguageOverrides(baseProviders: Record<string, Provider>, overrides: Record<string, any>): Record<string, Provider> {
    return deepMerge(baseProviders, overrides) as Record<string, Provider>;
}

function deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }

    return result;
}
