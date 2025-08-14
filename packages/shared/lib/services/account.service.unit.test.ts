import { describe, expect, it } from 'vitest';

import { emailToTeamName } from './account.service.js';

describe('emailToTeamName', () => {
    describe('when no email is provided', () => {
        it('should return false', () => {
            const result = emailToTeamName({ email: undefined });
            expect(result).toBe(false);
        });

        it('should return false for empty email', () => {
            const result = emailToTeamName({ email: '' });
            expect(result).toBe(false);
        });
    });

    describe('when email has no domain', () => {
        it('should return false for email without @ symbol', () => {
            const result = emailToTeamName({ email: 'john' });
            expect(result).toBe(false);
        });

        it('should return false for email with only @ symbol', () => {
            const result = emailToTeamName({ email: 'john@' });
            expect(result).toBe(false);
        });

        it('should return false for email with domain without dots', () => {
            const result = emailToTeamName({ email: 'john@invalid' });
            expect(result).toBe(false);
        });
    });

    describe('when email is from free email domains', () => {
        const freeEmailDomains = [
            'gmail.com',
            'duck.com',
            'anonaddy.me',
            'me.com',
            'hey.com',
            'icloud.com',
            'hotmail.com',
            'outlook.com',
            'aol.com',
            'yahoo.com',
            'gmx.com',
            'protonmail.com',
            'proton.me',
            'googlemail.com',
            'sina.com',
            'mail.com',
            'zoho.com',
            'zohomail.com',
            'fastmail.com',
            'tutanota.com',
            'tuta.io',
            'yandex.com',
            'yandex.ru',
            'inbox.com',
            'hushmail.com',
            'rediffmail.com',
            '163.com',
            '126.com',
            'yeah.net',
            'qq.com',
            'seznam.cz',
            'web.de',
            'mail.ru',
            'lycos.com',
            'excite.com',
            'rocketmail.com',
            'blueyonder.co.uk',
            'btinternet.com',
            'talktalk.net',
            'shaw.ca',
            'rogers.com',
            'sympatico.ca'
        ];

        freeEmailDomains.forEach((domain) => {
            it(`should return false for ${domain}`, () => {
                const result = emailToTeamName({ email: `john@${domain}` });
                expect(result).toBe(false);
            });
        });
    });

    describe('when email is from business domains', () => {
        it('should return capitalized domain name for simple domain', () => {
            const result = emailToTeamName({ email: 'john@acme.com' });
            expect(result).toBe('Acme');
        });

        it('should return capitalized domain name for multi-part domain', () => {
            // Note: The function takes all parts except the TLD, so .co.uk becomes .co
            const result = emailToTeamName({ email: 'john@mycompany.co.uk' });
            expect(result).toBe('Mycompany.co');
        });

        it('should handle domain with multiple subdomains', () => {
            // Note: The function takes all parts except the TLD, so dev.mycompany.com becomes dev.mycompany
            const result = emailToTeamName({ email: 'john@dev.mycompany.com' });
            expect(result).toBe('Dev.mycompany');
        });

        it('should handle domain with numbers', () => {
            const result = emailToTeamName({ email: 'john@company123.com' });
            expect(result).toBe('Company123');
        });

        it('should handle domain with hyphens', () => {
            const result = emailToTeamName({ email: 'john@my-company.com' });
            expect(result).toBe('My-company');
        });

        it('should handle domain with underscores', () => {
            const result = emailToTeamName({ email: 'john@my_company.com' });
            expect(result).toBe('My_company');
        });

        it('should handle single character domain', () => {
            const result = emailToTeamName({ email: 'john@a.com' });
            expect(result).toBe('A');
        });

        it('should handle domain with special characters', () => {
            const result = emailToTeamName({ email: 'john@company-name.com' });
            expect(result).toBe('Company-name');
        });
    });

    describe('edge cases', () => {
        it('should handle email with multiple @ symbols', () => {
            // Note: When there are multiple @ symbols, we take the last part after @
            const result = emailToTeamName({ email: 'john@test@example.com' });
            expect(result).toBe('Example');
        });

        it('should handle domain with only TLD', () => {
            // Note: When domain doesn't include a dot, it's invalid and returns false
            const result = emailToTeamName({ email: 'john@.com' });
            expect(result).toBe(false);
        });

        it('should handle domain with trailing dot', () => {
            // Note: Trailing dot is preserved in the domain parts
            const result = emailToTeamName({ email: 'john@company.com.' });
            expect(result).toBe('Company.com');
        });

        it('should handle domain with leading dot', () => {
            // Note: Leading dot is preserved in the domain parts
            const result = emailToTeamName({ email: 'john@.company.com' });
            expect(result).toBe('.company');
        });

        it('should handle email with no @ symbol', () => {
            const result = emailToTeamName({ email: 'invalid-email' });
            expect(result).toBe(false);
        });

        it('should handle email with multiple @ symbols and complex domain', () => {
            const result = emailToTeamName({ email: 'john@test@sub.example.com' });
            expect(result).toBe('Sub.example');
        });

        it('should handle case insensitive domain matching', () => {
            const result = emailToTeamName({ email: 'john@ACME.COM' });
            expect(result).toBe('Acme');
        });

        it('should handle domain with empty parts', () => {
            const result = emailToTeamName({ email: 'john@..com' });
            expect(result).toBe('.');
        });
    });
});
