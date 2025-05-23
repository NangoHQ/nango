import { describe, expect, it } from 'vitest';

import { parseAcceptLanguage } from './accept-language.middleware.js';

describe('parseAcceptLanguage', () => {
    describe('supported languages in order', () => {
        it('should return first supported language from comma-separated list', () => {
            expect(parseAcceptLanguage('es-ES,es;q=0.9,en;q=0.8')).toBe('es');
        });

        it('should return first supported language ignoring quality values', () => {
            expect(parseAcceptLanguage('fr;q=0.9,en;q=0.8,es;q=0.7')).toBe('fr');
        });

        it('should return second language if first is not supported', () => {
            expect(parseAcceptLanguage('zh-CN,es,en')).toBe('es');
        });

        it('should handle single language', () => {
            expect(parseAcceptLanguage('fr')).toBe('fr');
        });

        it('should handle language with country code', () => {
            expect(parseAcceptLanguage('de-DE')).toBe('de');
        });
    });

    describe('case sensitivity', () => {
        it('should handle uppercase language codes', () => {
            expect(parseAcceptLanguage('ES-ES,EN')).toBe('es');
        });

        it('should handle mixed case language codes', () => {
            expect(parseAcceptLanguage('Fr-CA,De-DE')).toBe('fr');
        });
    });

    describe('quality values', () => {
        it('should ignore quality values and prioritize by order', () => {
            expect(parseAcceptLanguage('en;q=0.1,es;q=0.9')).toBe('en');
        });

        it('should handle complex quality values', () => {
            expect(parseAcceptLanguage('fr;q=0.8,de;q=0.9,en;q=0.7')).toBe('fr');
        });
    });

    describe('unsupported languages', () => {
        it('should return en for unsupported languages', () => {
            expect(parseAcceptLanguage('zh-CN,ja,ko')).toBe('en');
        });

        it('should skip unsupported and return first supported', () => {
            expect(parseAcceptLanguage('zh-CN,ja,fr,ko')).toBe('fr');
        });
    });

    describe('edge cases', () => {
        it('should return en for undefined input', () => {
            expect(parseAcceptLanguage(undefined)).toBe('en');
        });

        it('should return en for empty string', () => {
            expect(parseAcceptLanguage('')).toBe('en');
        });

        it('should handle extra whitespace', () => {
            expect(parseAcceptLanguage(' es-ES , fr ; q=0.9 , en ')).toBe('es');
        });

        it('should handle empty tags', () => {
            expect(parseAcceptLanguage(',,es,,')).toBe('es');
        });

        it('should handle malformed tags', () => {
            expect(parseAcceptLanguage('invalid;;tag,fr')).toBe('fr');
        });
    });
});
