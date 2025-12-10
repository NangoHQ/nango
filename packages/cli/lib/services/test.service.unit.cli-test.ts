import { describe, expect, it } from 'vitest';

import { validateAndFilterIntegrations } from './test.service.js';

import type { IntegrationDefinition } from './test.service.js';

describe('validateAndFilterIntegrations', () => {
    // Sample integrations for testing
    const createMockIntegrations = (): Record<string, IntegrationDefinition> => ({
        github: {
            syncs: {
                'fetch-repos': { output: 'GithubRepo' },
                'fetch-issues': { output: 'GithubIssue' }
            },
            actions: {
                'create-issue': { output: 'GithubIssue' },
                'get-user': { output: 'GithubUser' }
            }
        },
        slack: {
            syncs: {
                'fetch-messages': { output: 'SlackMessage' }
            },
            actions: {
                'send-message': { output: 'SlackMessage' }
            }
        }
    });

    describe('integration filtering', () => {
        it('should return all integrations when no filters are provided', () => {
            const integrations = createMockIntegrations();
            const result = validateAndFilterIntegrations({ integrations });

            expect(result.valid).toBe(true);
            expect(Object.keys(result.filteredIntegrations)).toEqual(['github', 'slack']);
        });

        it('should return error when integration is not found', () => {
            const integrations = createMockIntegrations();
            const result = validateAndFilterIntegrations({
                integrations,
                integrationId: 'nonexistent-integration'
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Integration "nonexistent-integration" not found');
            expect(result.filteredIntegrations).toEqual({});
        });

        it('should filter to only specified integration when integrationId is provided', () => {
            const integrations = createMockIntegrations();
            const result = validateAndFilterIntegrations({
                integrations,
                integrationId: 'github'
            });

            expect(result.valid).toBe(true);
            expect(Object.keys(result.filteredIntegrations)).toEqual(['github']);
            expect(result.filteredIntegrations['github']).toBeDefined();
            expect(result.filteredIntegrations['slack']).toBeUndefined();
        });
    });

    describe('sync name validation', () => {
        it('should return error when sync name is not found', () => {
            const integrations = createMockIntegrations();
            const result = validateAndFilterIntegrations({
                integrations,
                syncName: 'nonexistent-sync'
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Sync "nonexistent-sync" not found');
            expect(result.filteredIntegrations).toEqual({});
        });

        it('should return error when sync name is not found within specified integration', () => {
            const integrations = createMockIntegrations();
            // fetch-messages exists in slack but not in github
            const result = validateAndFilterIntegrations({
                integrations,
                integrationId: 'github',
                syncName: 'fetch-messages'
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Sync "fetch-messages" not found');
        });

        it('should succeed when sync name exists across all integrations', () => {
            const integrations = createMockIntegrations();
            const result = validateAndFilterIntegrations({
                integrations,
                syncName: 'fetch-repos'
            });

            expect(result.valid).toBe(true);
            expect(Object.keys(result.filteredIntegrations)).toEqual(['github', 'slack']);
        });

        it('should succeed when sync name exists within specified integration', () => {
            const integrations = createMockIntegrations();
            const result = validateAndFilterIntegrations({
                integrations,
                integrationId: 'github',
                syncName: 'fetch-repos'
            });

            expect(result.valid).toBe(true);
            expect(Object.keys(result.filteredIntegrations)).toEqual(['github']);
        });
    });

    describe('action name validation', () => {
        it('should return error when action name is not found', () => {
            const integrations = createMockIntegrations();
            const result = validateAndFilterIntegrations({
                integrations,
                actionName: 'nonexistent-action'
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Action "nonexistent-action" not found');
            expect(result.filteredIntegrations).toEqual({});
        });

        it('should return error when action name is not found within specified integration', () => {
            const integrations = createMockIntegrations();
            // send-message exists in slack but not in github
            const result = validateAndFilterIntegrations({
                integrations,
                integrationId: 'github',
                actionName: 'send-message'
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Action "send-message" not found');
        });

        it('should succeed when action name exists across all integrations', () => {
            const integrations = createMockIntegrations();
            const result = validateAndFilterIntegrations({
                integrations,
                actionName: 'create-issue'
            });

            expect(result.valid).toBe(true);
            expect(Object.keys(result.filteredIntegrations)).toEqual(['github', 'slack']);
        });

        it('should succeed when action name exists within specified integration', () => {
            const integrations = createMockIntegrations();
            const result = validateAndFilterIntegrations({
                integrations,
                integrationId: 'slack',
                actionName: 'send-message'
            });

            expect(result.valid).toBe(true);
            expect(Object.keys(result.filteredIntegrations)).toEqual(['slack']);
        });
    });

    describe('combined filtering', () => {
        it('should allow combining integration and sync filters', () => {
            const integrations = createMockIntegrations();
            const result = validateAndFilterIntegrations({
                integrations,
                integrationId: 'github',
                syncName: 'fetch-repos'
            });

            expect(result.valid).toBe(true);
            expect(Object.keys(result.filteredIntegrations)).toEqual(['github']);
        });

        it('should allow combining integration and action filters', () => {
            const integrations = createMockIntegrations();
            const result = validateAndFilterIntegrations({
                integrations,
                integrationId: 'github',
                actionName: 'create-issue'
            });

            expect(result.valid).toBe(true);
            expect(Object.keys(result.filteredIntegrations)).toEqual(['github']);
        });

        it('should fail when sync does not exist in filtered integration', () => {
            const integrations = createMockIntegrations();
            // fetch-repos exists in github, not slack
            const result = validateAndFilterIntegrations({
                integrations,
                integrationId: 'slack',
                syncName: 'fetch-repos'
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Sync "fetch-repos" not found');
        });

        it('should fail when action does not exist in filtered integration', () => {
            const integrations = createMockIntegrations();
            // create-issue exists in github, not slack
            const result = validateAndFilterIntegrations({
                integrations,
                integrationId: 'slack',
                actionName: 'create-issue'
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Action "create-issue" not found');
        });

        it('should allow specifying both sync and action filters', () => {
            const integrations = createMockIntegrations();
            const result = validateAndFilterIntegrations({
                integrations,
                integrationId: 'github',
                syncName: 'fetch-repos',
                actionName: 'create-issue'
            });

            expect(result.valid).toBe(true);
        });

        it('should fail if sync exists but action does not in filtered integration', () => {
            const integrations = createMockIntegrations();
            const result = validateAndFilterIntegrations({
                integrations,
                integrationId: 'github',
                syncName: 'fetch-repos',
                actionName: 'send-message' // exists in slack, not github
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Action "send-message" not found');
        });
    });

    describe('empty integrations', () => {
        it('should handle integrations with no syncs', () => {
            const integrations: Record<string, IntegrationDefinition> = {
                'empty-integration': {
                    syncs: {},
                    actions: { 'some-action': { output: 'Output' } }
                }
            };

            const result = validateAndFilterIntegrations({ integrations });

            expect(result.valid).toBe(true);
            expect(Object.keys(result.filteredIntegrations)).toEqual(['empty-integration']);
        });

        it('should handle integrations with no actions', () => {
            const integrations: Record<string, IntegrationDefinition> = {
                'empty-integration': {
                    syncs: { 'some-sync': { output: 'Output' } },
                    actions: {}
                }
            };

            const result = validateAndFilterIntegrations({ integrations });

            expect(result.valid).toBe(true);
            expect(Object.keys(result.filteredIntegrations)).toEqual(['empty-integration']);
        });

        it('should handle no integrations', () => {
            const integrations: Record<string, IntegrationDefinition> = {};

            const result = validateAndFilterIntegrations({ integrations });

            expect(result.valid).toBe(true);
            expect(result.filteredIntegrations).toEqual({});
        });

        it('should fail when searching for sync in empty integrations', () => {
            const integrations: Record<string, IntegrationDefinition> = {};

            const result = validateAndFilterIntegrations({
                integrations,
                syncName: 'any-sync'
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Sync "any-sync" not found');
        });

        it('should fail when searching for action in empty integrations', () => {
            const integrations: Record<string, IntegrationDefinition> = {};

            const result = validateAndFilterIntegrations({
                integrations,
                actionName: 'any-action'
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Action "any-action" not found');
        });
    });

    describe('edge cases', () => {
        it('should handle sync with array output type', () => {
            const integrations: Record<string, IntegrationDefinition> = {
                test: {
                    syncs: { 'multi-output-sync': { output: ['Model1', 'Model2'] } },
                    actions: {}
                }
            };

            const result = validateAndFilterIntegrations({
                integrations,
                syncName: 'multi-output-sync'
            });

            expect(result.valid).toBe(true);
        });

        it('should handle action with null output type', () => {
            const integrations: Record<string, IntegrationDefinition> = {
                test: {
                    syncs: {},
                    actions: { 'void-action': { output: null } }
                }
            };

            const result = validateAndFilterIntegrations({
                integrations,
                actionName: 'void-action'
            });

            expect(result.valid).toBe(true);
        });

        it('should be case-sensitive for integration names', () => {
            const integrations = createMockIntegrations();

            const result = validateAndFilterIntegrations({
                integrations,
                integrationId: 'GitHub' // capital G
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Integration "GitHub" not found');
        });

        it('should be case-sensitive for sync names', () => {
            const integrations = createMockIntegrations();

            const result = validateAndFilterIntegrations({
                integrations,
                syncName: 'Fetch-Repos' // wrong case
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Sync "Fetch-Repos" not found');
        });

        it('should be case-sensitive for action names', () => {
            const integrations = createMockIntegrations();

            const result = validateAndFilterIntegrations({
                integrations,
                actionName: 'Create-Issue' // wrong case
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Action "Create-Issue" not found');
        });
    });
});
