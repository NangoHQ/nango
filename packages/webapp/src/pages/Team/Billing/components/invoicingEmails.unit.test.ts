import { describe, expect, it } from 'vitest';

import { isCompleteEmail, isFullyTokenizable, parseEmailTokens } from './invoicingEmails';

describe('parseEmailTokens', () => {
    it('splits on commas, spaces and newlines', () => {
        expect(parseEmailTokens('a@b.com, c@d.com')).toEqual(['a@b.com', 'c@d.com']);
        expect(parseEmailTokens('a@b.com c@d.com')).toEqual(['a@b.com', 'c@d.com']);
        expect(parseEmailTokens('a@b.com\nc@d.com')).toEqual(['a@b.com', 'c@d.com']);
    });

    it('drops empty segments from repeated or trailing separators', () => {
        expect(parseEmailTokens('a@b.com,,  ,c@d.com,')).toEqual(['a@b.com', 'c@d.com']);
    });

    it('returns nothing for blank input', () => {
        expect(parseEmailTokens('')).toEqual([]);
        expect(parseEmailTokens('   ')).toEqual([]);
    });
});

describe('isFullyTokenizable', () => {
    // A pasted address has to become a chip immediately — leaving it as plain text is what made
    // customers think the field hadn't accepted their new billing email.
    it('accepts a single complete address', () => {
        expect(isFullyTokenizable('ted@concourse.co')).toBe(true);
    });

    it('accepts a list where every entry is complete', () => {
        expect(isFullyTokenizable('a@b.com, c@d.com')).toBe(true);
    });

    it('rejects a partial address so it stays editable text', () => {
        expect(isFullyTokenizable('ted@')).toBe(false);
        expect(isFullyTokenizable('ted')).toBe(false);
    });

    it('rejects a list containing any incomplete entry', () => {
        expect(isFullyTokenizable('a@b.com, nope')).toBe(false);
    });

    it('rejects blank input', () => {
        expect(isFullyTokenizable('')).toBe(false);
        expect(isFullyTokenizable('  ')).toBe(false);
    });
});

describe('isCompleteEmail', () => {
    it('distinguishes complete addresses from fragments', () => {
        expect(isCompleteEmail('ted@concourse.co')).toBe(true);
        expect(isCompleteEmail('ted@concourse')).toBe(false);
        expect(isCompleteEmail('ted')).toBe(false);
    });
});
