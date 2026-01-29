import { describe, expect, it } from 'vitest';

import { connectionTagsSchema } from './schema.js';

describe('connectionTagsSchema', () => {
    describe('normalization', () => {
        it('should lowercase keys', () => {
            const result = connectionTagsSchema.safeParse({ ProjectId: 'abc', OrgID: 'def' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ projectid: 'abc', orgid: 'def' });
            }
        });

        it('should preserve values (not lowercase)', () => {
            const result = connectionTagsSchema.safeParse({ key: 'MyValue', other: 'TEST' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ key: 'MyValue', other: 'TEST' });
            }
        });

        it('should lowercase keys but preserve values', () => {
            const result = connectionTagsSchema.safeParse({ ProjectID: 'ABC123' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ projectid: 'ABC123' });
            }
        });

        it('should handle empty object', () => {
            const result = connectionTagsSchema.safeParse({});
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({});
            }
        });

        it('should handle already lowercase tags', () => {
            const result = connectionTagsSchema.safeParse({ key: 'value' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ key: 'value' });
            }
        });

        it('should lowercase keys but preserve values with special characters', () => {
            const result = connectionTagsSchema.safeParse({ 'myTag/Key': 'some_Value-Here' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ 'mytag/key': 'some_Value-Here' });
            }
        });

        it('should reject duplicate keys after normalization', () => {
            const result = connectionTagsSchema.safeParse({ ProjectId: 'a', projectid: 'b' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Duplicate tag key after case normalization: "projectid"');
            }
        });

        it('should reject duplicate keys with different casing', () => {
            const result = connectionTagsSchema.safeParse({ MyKey: 'a', MYKEY: 'b', mykey: 'c' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toContain('Duplicate tag key after case normalization');
            }
        });
    });

    describe('valid cases', () => {
        it('should accept valid tag with letter-starting key', () => {
            const result = connectionTagsSchema.safeParse({ project: '123' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ project: '123' });
            }
        });

        it('should accept keys starting with uppercase letter and normalize to lowercase', () => {
            const result = connectionTagsSchema.safeParse({ Project: '123' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ project: '123' });
            }
        });

        it('should accept keys with underscores', () => {
            const result = connectionTagsSchema.safeParse({ my_tag: 'value' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ my_tag: 'value' });
            }
        });

        it('should accept keys with hyphens', () => {
            const result = connectionTagsSchema.safeParse({ 'my-tag': 'value' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ 'my-tag': 'value' });
            }
        });

        it('should accept keys with periods', () => {
            const result = connectionTagsSchema.safeParse({ 'my.tag': 'value' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ 'my.tag': 'value' });
            }
        });

        it('should accept keys with slashes', () => {
            const result = connectionTagsSchema.safeParse({ 'my/tag': 'value' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ 'my/tag': 'value' });
            }
        });

        it('should accept keys with numbers after first letter', () => {
            const result = connectionTagsSchema.safeParse({ tag123: 'value' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ tag123: 'value' });
            }
        });

        it('should reject empty string values', () => {
            const result = connectionTagsSchema.safeParse({ key: '' });
            expect(result.success).toBe(false);
        });

        it('should accept arbitrary text values', () => {
            const result = connectionTagsSchema.safeParse({ key: 'Value with spaces, symbols @#!, and punctuation.' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ key: 'Value with spaces, symbols @#!, and punctuation.' });
            }
        });

        it('should accept end_user_email tag with valid email', () => {
            const result = connectionTagsSchema.safeParse({ end_user_email: 'user@example.com' });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ end_user_email: 'user@example.com' });
            }
        });

        it('should accept multiple valid tags and normalize keys only', () => {
            const result = connectionTagsSchema.safeParse({
                projectId: '123',
                orgId: '456',
                envType: 'Production'
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({
                    projectid: '123',
                    orgid: '456',
                    envtype: 'Production'
                });
            }
        });

        it('should accept exactly 10 keys', () => {
            const tags: Record<string, string> = {};
            for (let i = 0; i < 10; i++) {
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

        it('should reject values longer than 200 chars', () => {
            const value = 'a'.repeat(201);
            const result = connectionTagsSchema.safeParse({ key: value });
            expect(result.success).toBe(false);
        });

        it('should reject more than 10 keys', () => {
            const tags: Record<string, string> = {};
            for (let i = 0; i < 11; i++) {
                tags[`key${i}`] = `value${i}`;
            }
            const result = connectionTagsSchema.safeParse(tags);
            expect(result.success).toBe(false);
        });

        it('should reject keys with invalid special characters', () => {
            const result = connectionTagsSchema.safeParse({ 'key@invalid': 'value' });
            expect(result.success).toBe(false);
        });

        it('should reject end_user_email tag with invalid email', () => {
            const result = connectionTagsSchema.safeParse({ end_user_email: 'not-an-email' });
            expect(result.success).toBe(false);
        });

        it('should reject keys with colons', () => {
            const result = connectionTagsSchema.safeParse({ 'my:tag': 'value' });
            expect(result.success).toBe(false);
        });
    });
});
