import { describe, expect, it } from 'vitest';

import { buildTagsFromEndUser } from './endUser.service.js';

describe('endUser.service', () => {
    describe('buildTagsFromEndUser', () => {
        it('should return empty object when no inputs provided', () => {
            expect(buildTagsFromEndUser(null, null)).toEqual({});
            expect(buildTagsFromEndUser(undefined, undefined)).toEqual({});
        });

        it('should generate end_user_id from end_user.id', () => {
            const result = buildTagsFromEndUser({ id: 'user-123' }, null);
            expect(result).toEqual({ end_user_id: 'user-123' });
        });

        it('should generate all end_user fields when provided (keys mapped, values preserved)', () => {
            const result = buildTagsFromEndUser({ id: 'user-123', email: 'test@example.com', display_name: 'Test User' }, null);
            expect(result).toEqual({
                end_user_id: 'user-123',
                end_user_email: 'test@example.com',
                end_user_display_name: 'Test User'
            });
        });

        it('should not include optional end_user fields when not provided', () => {
            const result = buildTagsFromEndUser({ id: 'user-123' }, null);
            expect(result).toEqual({ end_user_id: 'user-123' });
            expect(result).not.toHaveProperty('end_user_email');
            expect(result).not.toHaveProperty('end_user_display_name');
        });

        it('should copy end_user.tags', () => {
            const result = buildTagsFromEndUser({ id: 'user-123', tags: { project_id: 'proj-1', team: 'alpha' } }, null);
            expect(result).toEqual({
                end_user_id: 'user-123',
                project_id: 'proj-1',
                team: 'alpha'
            });
        });

        it('should allow end_user.tags to override auto-generated end_user tags', () => {
            const result = buildTagsFromEndUser({ id: 'user-123', tags: { end_user_id: 'custom-id' } }, null);
            expect(result).toEqual({ end_user_id: 'custom-id' });
        });

        it('should generate organization_id from organization.id', () => {
            const result = buildTagsFromEndUser(null, { id: 'org-456' });
            expect(result).toEqual({ organization_id: 'org-456' });
        });

        it('should generate all organization fields when provided (keys mapped, values preserved)', () => {
            const result = buildTagsFromEndUser(null, { id: 'org-456', display_name: 'Acme Corp' });
            expect(result).toEqual({
                organization_id: 'org-456',
                organization_display_name: 'Acme Corp'
            });
        });

        it('should not include optional organization fields when not provided', () => {
            const result = buildTagsFromEndUser(null, { id: 'org-456' });
            expect(result).toEqual({ organization_id: 'org-456' });
            expect(result).not.toHaveProperty('organization_display_name');
        });

        it('should handle empty end_user.tags', () => {
            const result = buildTagsFromEndUser({ id: 'user-123', tags: {} }, null);
            expect(result).toEqual({ end_user_id: 'user-123' });
        });

        it('should handle both endUser and organization together (keys mapped, values preserved)', () => {
            const result = buildTagsFromEndUser({ id: 'user-123', email: 'user@example.com' }, { id: 'org-456', display_name: 'My Org' });
            expect(result).toEqual({
                end_user_id: 'user-123',
                end_user_email: 'user@example.com',
                organization_id: 'org-456',
                organization_display_name: 'My Org'
            });
        });

        it('should combine end_user fields and end_user.tags with correct priority (keys mapped, values preserved)', () => {
            const result = buildTagsFromEndUser(
                {
                    id: 'user-123',
                    email: 'test@example.com',
                    display_name: 'Test',
                    tags: { custom_key: 'custom_value', end_user_email: 'override@example.com' }
                },
                { id: 'org-456', display_name: 'Org' }
            );
            expect(result).toEqual({
                end_user_id: 'user-123',
                end_user_email: 'override@example.com', // from end_user.tags (overrides auto-gen)
                end_user_display_name: 'Test',
                organization_id: 'org-456',
                organization_display_name: 'Org',
                custom_key: 'custom_value'
            });
        });

        it('should truncate too-long tag keys and values from end_user.tags', () => {
            const longKey = 'a'.repeat(70);
            const longKeyTruncated = 'a'.repeat(64);
            const longValue = 'b'.repeat(300);
            const longValueTruncated = 'b'.repeat(255);

            const result = buildTagsFromEndUser(
                {
                    id: 'user-123',
                    email: 'test@example.com',
                    tags: { [longKey]: longValue }
                },
                null
            );

            expect(result).toEqual({
                end_user_id: 'user-123',
                end_user_email: 'test@example.com',
                [longKeyTruncated]: longValueTruncated
            });
        });

        it('should skip invalid end_user.tags keys (format) while keeping base tags', () => {
            const result = buildTagsFromEndUser(
                {
                    id: 'user-123',
                    email: 'test@example.com',
                    tags: {
                        '123bad': 'v1',
                        'bad key': 'v2',
                        'good/tag': 'ok',
                        'Bad.Key': 'keep'
                    }
                },
                null
            );

            expect(result).toEqual({
                end_user_id: 'user-123',
                end_user_email: 'test@example.com',
                'good/tag': 'ok',
                'bad.key': 'keep'
            });
        });

        it('should drop end_user.tags when base + end_user.tags exceeds max key count (includes organization)', () => {
            const result = buildTagsFromEndUser(
                {
                    id: 'user-123',
                    email: 'test@example.com',
                    display_name: 'Test',
                    tags: {
                        tag1: '1',
                        tag2: '2',
                        tag3: '3',
                        tag4: '4',
                        tag5: '5',
                        tag6: '6'
                    }
                },
                { id: 'org-456', display_name: 'Org' }
            );

            expect(result).toEqual({
                end_user_id: 'user-123',
                end_user_email: 'test@example.com',
                end_user_display_name: 'Test',
                organization_id: 'org-456',
                organization_display_name: 'Org'
            });
        });
    });
});
