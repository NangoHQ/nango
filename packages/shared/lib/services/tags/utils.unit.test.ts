import { describe, expect, it } from 'vitest';

import { normalizeTags, validateTags } from './utils.js';

describe('normalizeTags', () => {
    it('should lowercase keys', () => {
        const result = normalizeTags({ ProjectId: 'abc', OrgID: 'def' });
        expect(result).toEqual({ success: true, tags: { projectid: 'abc', orgid: 'def' } });
    });

    it('should lowercase values', () => {
        const result = normalizeTags({ key: 'MyValue', other: 'TEST' });
        expect(result).toEqual({ success: true, tags: { key: 'myvalue', other: 'test' } });
    });

    it('should lowercase both keys and values', () => {
        const result = normalizeTags({ ProjectID: 'ABC123' });
        expect(result).toEqual({ success: true, tags: { projectid: 'abc123' } });
    });

    it('should handle empty object', () => {
        const result = normalizeTags({});
        expect(result).toEqual({ success: true, tags: {} });
    });

    it('should handle already lowercase tags', () => {
        const result = normalizeTags({ key: 'value' });
        expect(result).toEqual({ success: true, tags: { key: 'value' } });
    });

    it('should preserve special characters', () => {
        const result = normalizeTags({ 'my:Tag/Key': 'some_Value-Here' });
        expect(result).toEqual({ success: true, tags: { 'my:tag/key': 'some_value-here' } });
    });

    it('should reject duplicate keys after normalization', () => {
        const result = normalizeTags({ ProjectId: 'a', projectid: 'b' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBe('Duplicate tag key after case normalization: "projectid"');
        }
    });

    it('should reject duplicate keys with different casing', () => {
        const result = normalizeTags({ MyKey: 'a', MYKEY: 'b', mykey: 'c' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain('Duplicate tag key after case normalization');
        }
    });
});

describe('validateTags', () => {
    describe('valid cases', () => {
        it('should accept empty object and return empty tags', () => {
            const result = validateTags({});
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({});
            }
        });

        it('should accept valid tag with letter-starting key and return normalized tags', () => {
            const result = validateTags({ project: '123' });
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({ project: '123' });
            }
        });

        it('should accept keys starting with uppercase letter and normalize to lowercase', () => {
            const result = validateTags({ Project: '123' });
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({ project: '123' });
            }
        });

        it('should normalize uppercase values to lowercase', () => {
            const result = validateTags({ key: 'MyValue' });
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({ key: 'myvalue' });
            }
        });

        it('should normalize both keys and values to lowercase', () => {
            const result = validateTags({ ProjectID: 'ABC123', OrgName: 'TestOrg' });
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({ projectid: 'abc123', orgname: 'testorg' });
            }
        });

        it('should accept keys with underscores', () => {
            const result = validateTags({ my_tag: 'value' });
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({ my_tag: 'value' });
            }
        });

        it('should accept keys with hyphens', () => {
            const result = validateTags({ 'my-tag': 'value' });
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({ 'my-tag': 'value' });
            }
        });

        it('should accept keys with colons', () => {
            const result = validateTags({ 'my:tag': 'value' });
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({ 'my:tag': 'value' });
            }
        });

        it('should accept keys with periods', () => {
            const result = validateTags({ 'my.tag': 'value' });
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({ 'my.tag': 'value' });
            }
        });

        it('should accept keys with slashes', () => {
            const result = validateTags({ 'my/tag': 'value' });
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({ 'my/tag': 'value' });
            }
        });

        it('should accept keys with numbers after first letter', () => {
            const result = validateTags({ tag123: 'value' });
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({ tag123: 'value' });
            }
        });

        it('should accept empty string values', () => {
            const result = validateTags({ key: '' });
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({ key: '' });
            }
        });

        it('should accept values with alphanumerics', () => {
            const result = validateTags({ key: 'value123' });
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({ key: 'value123' });
            }
        });

        it('should accept values with underscores, hyphens, colons, periods, slashes', () => {
            const result = validateTags({ key: 'val_123-test:foo.bar/baz' });
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({ key: 'val_123-test:foo.bar/baz' });
            }
        });

        it('should accept multiple valid tags and normalize them', () => {
            const result = validateTags({
                projectId: '123',
                orgId: '456',
                'env:type': 'Production'
            });
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.tags).toEqual({
                    projectid: '123',
                    orgid: '456',
                    'env:type': 'production'
                });
            }
        });

        it('should accept exactly 64 keys', () => {
            const tags: Record<string, string> = {};
            for (let i = 0; i < 64; i++) {
                tags[`key${i}`] = `value${i}`;
            }
            const result = validateTags(tags);
            expect(result.valid).toBe(true);
        });

        it('should accept key at max length (64 chars)', () => {
            const key = 'a'.repeat(64);
            const result = validateTags({ [key]: 'value' });
            expect(result.valid).toBe(true);
        });

        it('should accept value at max length (200 chars)', () => {
            const value = 'a'.repeat(200);
            const result = validateTags({ key: value });
            expect(result.valid).toBe(true);
        });
    });

    describe('invalid cases', () => {
        it('should reject keys starting with number', () => {
            const result = validateTags({ '123project': 'value' });
            expect(result.valid).toBe(false);
        });

        it('should reject keys starting with underscore', () => {
            const result = validateTags({ _project: 'value' });
            expect(result.valid).toBe(false);
        });

        it('should reject keys starting with hyphen', () => {
            const result = validateTags({ '-project': 'value' });
            expect(result.valid).toBe(false);
        });

        it('should reject keys with spaces', () => {
            const result = validateTags({ 'my tag': 'value' });
            expect(result.valid).toBe(false);
        });

        it('should reject keys longer than 64 chars', () => {
            const key = 'a'.repeat(65);
            const result = validateTags({ [key]: 'value' });
            expect(result.valid).toBe(false);
        });

        it('should reject values with spaces', () => {
            const result = validateTags({ key: 'my value' });
            expect(result.valid).toBe(false);
        });

        it('should reject values longer than 200 chars', () => {
            const value = 'a'.repeat(201);
            const result = validateTags({ key: value });
            expect(result.valid).toBe(false);
        });

        it('should reject more than 64 keys', () => {
            const tags: Record<string, string> = {};
            for (let i = 0; i < 65; i++) {
                tags[`key${i}`] = `value${i}`;
            }
            const result = validateTags(tags);
            expect(result.valid).toBe(false);
        });

        it('should reject keys with invalid special characters', () => {
            const result = validateTags({ 'key@invalid': 'value' });
            expect(result.valid).toBe(false);
        });

        it('should reject values with invalid special characters', () => {
            const result = validateTags({ key: 'value@invalid' });
            expect(result.valid).toBe(false);
        });

        it('should reject duplicate keys after case normalization', () => {
            const result = validateTags({ ProjectId: 'a', projectid: 'b' });
            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.error).toBe('Duplicate tag key after case normalization: "projectid"');
            }
        });
    });
});
