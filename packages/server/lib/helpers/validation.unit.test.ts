import { describe, expect, it } from 'vitest';

import { connectionTagsSchema } from './validation.js';

describe('connectionTagsSchema', () => {
    describe('valid cases', () => {
        it('should accept empty object', () => {
            const result = connectionTagsSchema.safeParse({});
            expect(result.success).toBe(true);
        });

        it('should accept valid tag with letter-starting key', () => {
            const result = connectionTagsSchema.safeParse({ project: '123' });
            expect(result.success).toBe(true);
        });

        it('should accept keys starting with uppercase letter', () => {
            const result = connectionTagsSchema.safeParse({ Project: '123' });
            expect(result.success).toBe(true);
        });

        it('should accept keys with underscores', () => {
            const result = connectionTagsSchema.safeParse({ my_tag: 'value' });
            expect(result.success).toBe(true);
        });

        it('should accept keys with hyphens', () => {
            const result = connectionTagsSchema.safeParse({ 'my-tag': 'value' });
            expect(result.success).toBe(true);
        });

        it('should accept keys with colons', () => {
            const result = connectionTagsSchema.safeParse({ 'my:tag': 'value' });
            expect(result.success).toBe(true);
        });

        it('should accept keys with periods', () => {
            const result = connectionTagsSchema.safeParse({ 'my.tag': 'value' });
            expect(result.success).toBe(true);
        });

        it('should accept keys with slashes', () => {
            const result = connectionTagsSchema.safeParse({ 'my/tag': 'value' });
            expect(result.success).toBe(true);
        });

        it('should accept keys with numbers after first letter', () => {
            const result = connectionTagsSchema.safeParse({ tag123: 'value' });
            expect(result.success).toBe(true);
        });

        it('should accept empty string values', () => {
            const result = connectionTagsSchema.safeParse({ key: '' });
            expect(result.success).toBe(true);
        });

        it('should accept values with alphanumerics', () => {
            const result = connectionTagsSchema.safeParse({ key: 'value123' });
            expect(result.success).toBe(true);
        });

        it('should accept values with underscores, hyphens, colons, periods, slashes', () => {
            const result = connectionTagsSchema.safeParse({ key: 'val_123-test:foo.bar/baz' });
            expect(result.success).toBe(true);
        });

        it('should accept multiple valid tags', () => {
            const result = connectionTagsSchema.safeParse({
                projectId: '123',
                orgId: '456',
                'env:type': 'production'
            });
            expect(result.success).toBe(true);
        });

        it('should accept exactly 64 keys', () => {
            const tags: Record<string, string> = {};
            for (let i = 0; i < 64; i++) {
                tags[`key${i}`] = `value${i}`;
            }
            const result = connectionTagsSchema.safeParse(tags);
            expect(result.success).toBe(true);
        });

        it('should accept key at max length (64 chars)', () => {
            const key = 'a'.repeat(64);
            const result = connectionTagsSchema.safeParse({ [key]: 'value' });
            expect(result.success).toBe(true);
        });

        it('should accept value at max length (200 chars)', () => {
            const value = 'a'.repeat(200);
            const result = connectionTagsSchema.safeParse({ key: value });
            expect(result.success).toBe(true);
        });
    });

    describe('invalid cases', () => {
        it('should reject keys starting with number', () => {
            const result = connectionTagsSchema.safeParse({ '123project': 'value' });
            expect(result.success).toBe(false);
        });

        it('should reject keys starting with underscore', () => {
            const result = connectionTagsSchema.safeParse({ _project: 'value' });
            expect(result.success).toBe(false);
        });

        it('should reject keys starting with hyphen', () => {
            const result = connectionTagsSchema.safeParse({ '-project': 'value' });
            expect(result.success).toBe(false);
        });

        it('should reject keys with spaces', () => {
            const result = connectionTagsSchema.safeParse({ 'my tag': 'value' });
            expect(result.success).toBe(false);
        });

        it('should reject keys longer than 64 chars', () => {
            const key = 'a'.repeat(65);
            const result = connectionTagsSchema.safeParse({ [key]: 'value' });
            expect(result.success).toBe(false);
        });

        it('should reject values with spaces', () => {
            const result = connectionTagsSchema.safeParse({ key: 'my value' });
            expect(result.success).toBe(false);
        });

        it('should reject values longer than 200 chars', () => {
            const value = 'a'.repeat(201);
            const result = connectionTagsSchema.safeParse({ key: value });
            expect(result.success).toBe(false);
        });

        it('should reject more than 64 keys', () => {
            const tags: Record<string, string> = {};
            for (let i = 0; i < 65; i++) {
                tags[`key${i}`] = `value${i}`;
            }
            const result = connectionTagsSchema.safeParse(tags);
            expect(result.success).toBe(false);
        });

        it('should reject keys with invalid special characters', () => {
            const result = connectionTagsSchema.safeParse({ 'key@invalid': 'value' });
            expect(result.success).toBe(false);
        });

        it('should reject values with invalid special characters', () => {
            const result = connectionTagsSchema.safeParse({ key: 'value@invalid' });
            expect(result.success).toBe(false);
        });
    });
});
