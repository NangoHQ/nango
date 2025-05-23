import { describe, expect, it } from 'vitest';

import { parseAcceptLanguage } from './accept-language.middleware.js';

describe('parseAcceptLanguage', () => {
    describe('quality value priority', () => {
        it('should return language with highest quality value', () => {
            expect(parseAcceptLanguage('en;q=0.1,es;q=0.9')).toBe('es');
        });

        it('should handle complex quality values', () => {
            expect(parseAcceptLanguage('fr;q=0.8,de;q=0.9,en;q=0.7')).toBe('de');
        });

        it('should default to 1.0 for languages without quality values', () => {
            expect(parseAcceptLanguage('es,en;q=0.9')).toBe('es');
        });

        it('should handle mixed languages with and without quality values', () => {
            expect(parseAcceptLanguage('en;q=0.8,fr,de;q=0.9')).toBe('fr');
        });
    });

    describe('supported languages filtering', () => {
        it('should return first supported language from comma-separated list when equal priority', () => {
            expect(parseAcceptLanguage('es-ES,en,fr')).toBe('es');
        });

        it('should skip unsupported and return highest priority supported', () => {
            expect(parseAcceptLanguage('zh-CN;q=1.0,es;q=0.9,en;q=0.8')).toBe('es');
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
            expect(parseAcceptLanguage('ES-ES;q=0.9,EN;q=0.8')).toBe('es');
        });

        it('should handle mixed case language codes', () => {
            expect(parseAcceptLanguage('Fr-CA;q=0.8,De-DE;q=0.9')).toBe('de');
        });
    });

    describe('unsupported languages', () => {
        it('should return en for unsupported languages', () => {
            expect(parseAcceptLanguage('zh-CN,ja,ko')).toBe('en');
        });

        it('should skip unsupported and return highest priority supported', () => {
            expect(parseAcceptLanguage('zh-CN;q=1.0,ja;q=0.9,fr;q=0.8,ko;q=0.7')).toBe('fr');
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
            expect(parseAcceptLanguage(' es-ES;q=0.8 , fr ; q=0.9 , en;q=0.7 ')).toBe('fr');
        });

        it('should handle empty tags', () => {
            expect(parseAcceptLanguage(',,es;q=0.9,,')).toBe('es');
        });

        it('should handle malformed quality values', () => {
            expect(parseAcceptLanguage('es;q=invalid,fr;q=0.9')).toBe('es');
        });

        it('should handle missing quality value after q=', () => {
            expect(parseAcceptLanguage('es;q=,fr;q=0.9')).toBe('es');
        });
    });

    describe('real-world examples', () => {
        it('should handle Chrome default (en has highest implicit priority)', () => {
            expect(parseAcceptLanguage('en-US,en;q=0.9')).toBe('en');
        });

        it('should handle Firefox Spanish (es has highest priority)', () => {
            expect(parseAcceptLanguage('es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3')).toBe('es');
        });

        it('should handle Safari French (fr has highest explicit priority)', () => {
            expect(parseAcceptLanguage('fr-FR,fr;q=0.9,en;q=0.8,de;q=0.7,*;q=0.5')).toBe('fr');
        });

        it('should handle mobile browser (de has highest implicit priority)', () => {
            expect(parseAcceptLanguage('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
        });

        it('should prioritize by quality when order differs', () => {
            expect(parseAcceptLanguage('en;q=0.7,es;q=0.9,fr;q=0.8')).toBe('es');
        });
    });
});
