import { describe, expect, it } from 'vitest';

import { StaticEvaluator } from './evaluator.js';

import type { Permission } from './types.js';

const evaluator = new StaticEvaluator();

describe('StaticEvaluator', () => {
    describe('administrator', () => {
        it('should allow everything', async () => {
            const perms: Permission[] = [
                { action: 'update', resource: 'team', scope: 'global' },
                { action: '*', resource: 'billing', scope: 'global' },
                { action: 'update', resource: 'integration', scope: 'production' },
                { action: 'read', resource: 'connection', scope: 'production' },
                { action: 'read', resource: 'secret_key', scope: 'production' },
                { action: 'read', resource: 'connection_credential', scope: 'production' },
                { action: 'create', resource: 'environment', scope: 'global' },
                { action: '*', resource: '*', scope: 'production' }
            ];

            for (const perm of perms) {
                await expect(evaluator.evaluate('administrator', perm)).resolves.toBe(true);
            }
        });
    });

    describe('production_support', () => {
        it('should deny team management', async () => {
            await expect(evaluator.evaluate('production_support', { action: 'update', resource: 'team', scope: 'global' })).resolves.toBe(false);
            await expect(evaluator.evaluate('production_support', { action: 'delete', resource: 'team_member', scope: 'global' })).resolves.toBe(false);
            await expect(evaluator.evaluate('production_support', { action: 'update', resource: 'invite', scope: 'global' })).resolves.toBe(false);
        });

        it('should deny billing', async () => {
            await expect(evaluator.evaluate('production_support', { action: '*', resource: 'billing', scope: 'global' })).resolves.toBe(false);
            await expect(evaluator.evaluate('production_support', { action: 'update', resource: 'plan', scope: 'global' })).resolves.toBe(false);
        });

        it('should deny environment creation', async () => {
            await expect(evaluator.evaluate('production_support', { action: 'create', resource: 'environment', scope: 'global' })).resolves.toBe(false);
        });

        it('should deny is_production toggle', async () => {
            await expect(
                evaluator.evaluate('production_support', { action: 'update', resource: 'environment_production_flag', scope: 'global' })
            ).resolves.toBe(false);
        });

        it('should deny production write operations', async () => {
            await expect(evaluator.evaluate('production_support', { action: 'update', resource: 'integration', scope: 'production' })).resolves.toBe(false);
            await expect(evaluator.evaluate('production_support', { action: 'update', resource: 'connection', scope: 'production' })).resolves.toBe(false);
            await expect(evaluator.evaluate('production_support', { action: 'update', resource: 'flow', scope: 'production' })).resolves.toBe(false);
        });

        it('should deny production secrets/credentials', async () => {
            await expect(evaluator.evaluate('production_support', { action: 'read', resource: 'secret_key', scope: 'production' })).resolves.toBe(false);
            await expect(evaluator.evaluate('production_support', { action: 'read', resource: 'connection_credential', scope: 'production' })).resolves.toBe(
                false
            );
        });

        it('should allow production read operations', async () => {
            await expect(evaluator.evaluate('production_support', { action: 'read', resource: 'integration', scope: 'production' })).resolves.toBe(true);
            await expect(evaluator.evaluate('production_support', { action: 'read', resource: 'connection', scope: 'production' })).resolves.toBe(true);
            await expect(evaluator.evaluate('production_support', { action: 'read', resource: 'environment', scope: 'production' })).resolves.toBe(true);
            await expect(evaluator.evaluate('production_support', { action: 'read', resource: 'log', scope: 'production' })).resolves.toBe(true);
        });

        it('should allow production sync commands', async () => {
            await expect(evaluator.evaluate('production_support', { action: 'update', resource: 'sync_command', scope: 'production' })).resolves.toBe(true);
        });

        it('should allow non-prod everything', async () => {
            await expect(evaluator.evaluate('production_support', { action: 'update', resource: 'integration', scope: 'non-production' })).resolves.toBe(true);
            await expect(evaluator.evaluate('production_support', { action: 'delete', resource: 'connection', scope: 'non-production' })).resolves.toBe(true);
            await expect(evaluator.evaluate('production_support', { action: 'read', resource: 'secret_key', scope: 'non-production' })).resolves.toBe(true);
        });
    });

    describe('development_full_access', () => {
        it('should deny all production access', async () => {
            await expect(evaluator.evaluate('development_full_access', { action: 'read', resource: 'integration', scope: 'production' })).resolves.toBe(false);
            await expect(evaluator.evaluate('development_full_access', { action: 'read', resource: 'connection', scope: 'production' })).resolves.toBe(false);
            await expect(evaluator.evaluate('development_full_access', { action: 'update', resource: 'integration', scope: 'production' })).resolves.toBe(
                false
            );
            await expect(evaluator.evaluate('development_full_access', { action: 'read', resource: 'environment', scope: 'production' })).resolves.toBe(false);
            await expect(evaluator.evaluate('development_full_access', { action: 'read', resource: 'secret_key', scope: 'production' })).resolves.toBe(false);
            await expect(
                evaluator.evaluate('development_full_access', { action: 'read', resource: 'connection_credential', scope: 'production' })
            ).resolves.toBe(false);
        });

        it('should deny production sync commands', async () => {
            await expect(evaluator.evaluate('development_full_access', { action: 'update', resource: 'sync_command', scope: 'production' })).resolves.toBe(
                false
            );
        });

        it('should deny team management', async () => {
            await expect(evaluator.evaluate('development_full_access', { action: 'update', resource: 'team', scope: 'global' })).resolves.toBe(false);
            await expect(evaluator.evaluate('development_full_access', { action: 'update', resource: 'invite', scope: 'global' })).resolves.toBe(false);
        });

        it('should deny environment creation', async () => {
            await expect(evaluator.evaluate('development_full_access', { action: 'create', resource: 'environment', scope: 'global' })).resolves.toBe(false);
        });

        it('should allow non-prod everything', async () => {
            await expect(evaluator.evaluate('development_full_access', { action: 'update', resource: 'integration', scope: 'non-production' })).resolves.toBe(
                true
            );
            await expect(evaluator.evaluate('development_full_access', { action: 'delete', resource: 'connection', scope: 'non-production' })).resolves.toBe(
                true
            );
            await expect(evaluator.evaluate('development_full_access', { action: 'read', resource: 'secret_key', scope: 'non-production' })).resolves.toBe(
                true
            );
            await expect(
                evaluator.evaluate('development_full_access', { action: 'read', resource: 'connection_credential', scope: 'non-production' })
            ).resolves.toBe(true);
        });

        it('should allow non-prod sync commands', async () => {
            await expect(evaluator.evaluate('development_full_access', { action: 'update', resource: 'sync_command', scope: 'non-production' })).resolves.toBe(
                true
            );
        });

        it('should allow account-level reads (plans, user, getting-started)', async () => {
            await expect(evaluator.evaluate('development_full_access', { action: 'read', resource: 'plan', scope: 'global' })).resolves.toBe(true);
        });
    });

    describe('unknown role', () => {
        it('should deny everything', async () => {
            // @ts-expect-error testing unknown role
            await expect(evaluator.evaluate('unknown', { action: 'read', resource: 'integration', scope: 'non-production' })).resolves.toBe(false);
        });
    });
});
