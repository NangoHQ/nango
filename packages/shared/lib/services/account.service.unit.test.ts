import { describe, expect, it } from 'vitest';

import { parseTeamName } from './account.service.js';

describe('parseTeamName', () => {
    describe('when no email is provided', () => {
        it('should return name with "s Team" suffix', () => {
            const result = parseTeamName({ name: 'John' });
            expect(result).toBe("John's Team");
        });

        it('should handle names with special characters', () => {
            const result = parseTeamName({ name: 'John-Doe' });
            expect(result).toBe("John-Doe's Team");
        });

        it('should handle empty name', () => {
            const result = parseTeamName({ name: '' });
            expect(result).toBe("'s Team");
        });
    });

    describe('when email has no domain', () => {
        it('should return name with "s Team" suffix', () => {
            const result = parseTeamName({ name: 'John', email: 'john' });
            expect(result).toBe("John's Team");
        });

        it('should handle email with only @ symbol', () => {
            const result = parseTeamName({ name: 'John', email: 'john@' });
            expect(result).toBe("John's Team");
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
            it(`should return name with "s Team" suffix for ${domain}`, () => {
                const result = parseTeamName({ name: 'John', email: `john@${domain}` });
                expect(result).toBe("John's Team");
            });
        });
    });

    describe('when email is from business domains', () => {
        it('should return capitalized domain name for simple domain', () => {
            const result = parseTeamName({ name: 'John', email: 'john@acme.com' });
            expect(result).toBe('Acme');
        });

        it('should return capitalized domain name for multi-part domain', () => {
            // Note: The function takes all parts except the TLD, so .co.uk becomes .co
            const result = parseTeamName({ name: 'John', email: 'john@mycompany.co.uk' });
            expect(result).toBe('Mycompany.co');
        });

        it('should handle domain with multiple subdomains', () => {
            // Note: The function takes all parts except the TLD, so dev.mycompany.com becomes dev.mycompany
            const result = parseTeamName({ name: 'John', email: 'john@dev.mycompany.com' });
            expect(result).toBe('Dev.mycompany');
        });

        it('should handle domain with numbers', () => {
            const result = parseTeamName({ name: 'John', email: 'john@company123.com' });
            expect(result).toBe('Company123');
        });

        it('should handle domain with hyphens', () => {
            const result = parseTeamName({ name: 'John', email: 'john@my-company.com' });
            expect(result).toBe('My-company');
        });

        it('should handle domain with underscores', () => {
            const result = parseTeamName({ name: 'John', email: 'john@my_company.com' });
            expect(result).toBe('My_company');
        });

        it('should handle single character domain', () => {
            const result = parseTeamName({ name: 'John', email: 'john@a.com' });
            expect(result).toBe('A');
        });

        it('should handle domain with special characters', () => {
            const result = parseTeamName({ name: 'John', email: 'john@company-name.com' });
            expect(result).toBe('Company-name');
        });
    });

    describe('edge cases', () => {
        it('should handle email with multiple @ symbols', () => {
            // Note: When there are multiple @ symbols, split('@')[1] returns undefined, leading to empty domain
            const result = parseTeamName({ name: 'John', email: 'john@test@example.com' });
            expect(result).toBe('');
        });

        it('should handle domain with only TLD', () => {
            // Note: When domain is just .com, split('.') results in empty parts, leading to empty domain
            const result = parseTeamName({ name: 'John', email: 'john@.com' });
            expect(result).toBe('');
        });

        it('should handle domain with trailing dot', () => {
            // Note: Trailing dot is preserved in the domain parts
            const result = parseTeamName({ name: 'John', email: 'john@company.com.' });
            expect(result).toBe('Company.com');
        });

        it('should handle domain with leading dot', () => {
            // Note: Leading dot is preserved in the domain parts
            const result = parseTeamName({ name: 'John', email: 'john@.company.com' });
            expect(result).toBe('.company');
        });
    });
});
