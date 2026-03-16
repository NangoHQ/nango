import { describe, expect, it } from 'vitest';

import { StaticEvaluator } from './evaluator.js';

import type { Permission } from './types.js';

const evaluator = new StaticEvaluator();

describe('StaticEvaluator', () => {
    describe('administrator', () => {
        it('should allow everything', async () => {
            const perms: Permission[] = [
                { action: 'write', resource: 'team', isProduction: null },
                { action: '*', resource: 'billing', isProduction: null },
                { action: 'write', resource: 'integration', isProduction: true },
                { action: 'read', resource: 'connection', isProduction: true },
                { action: 'read', resource: 'secret_key', isProduction: true },
                { action: 'read', resource: 'connection_credential', isProduction: true },
                { action: 'create', resource: 'environment', isProduction: null },
                { action: '*', resource: '*', isProduction: true }
            ];

            for (const perm of perms) {
                await expect(evaluator.evaluate({ role: 'administrator' }, perm)).resolves.toBe(true);
            }
        });
    });

    describe('production_support', () => {
        it('should deny team management', async () => {
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'team', isProduction: null })).resolves.toBe(false);
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'delete', resource: 'team_member', isProduction: null })).resolves.toBe(
                false
            );
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'invite', isProduction: null })).resolves.toBe(false);
        });

        it('should deny billing', async () => {
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: '*', resource: 'billing', isProduction: null })).resolves.toBe(false);
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'plan', isProduction: null })).resolves.toBe(false);
        });

        it('should deny environment creation', async () => {
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'create', resource: 'environment', isProduction: null })).resolves.toBe(
                false
            );
        });

        it('should deny is_production toggle', async () => {
            await expect(
                evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'environment_production_flag', isProduction: null })
            ).resolves.toBe(false);
        });

        it('should deny production write operations', async () => {
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'integration', isProduction: true })).resolves.toBe(
                false
            );
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'connection', isProduction: true })).resolves.toBe(
                false
            );
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'flow', isProduction: true })).resolves.toBe(false);
        });

        it('should deny production secrets/credentials', async () => {
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'read', resource: 'secret_key', isProduction: true })).resolves.toBe(
                false
            );
            await expect(
                evaluator.evaluate({ role: 'production_support' }, { action: 'read', resource: 'connection_credential', isProduction: true })
            ).resolves.toBe(false);
        });

        it('should allow production read operations', async () => {
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'read', resource: 'integration', isProduction: true })).resolves.toBe(
                true
            );
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'read', resource: 'connection', isProduction: true })).resolves.toBe(
                true
            );
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'read', resource: 'environment', isProduction: true })).resolves.toBe(
                true
            );
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'read', resource: 'log', isProduction: true })).resolves.toBe(true);
        });

        it('should allow production sync commands', async () => {
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'sync_command', isProduction: true })).resolves.toBe(
                true
            );
        });

        it('should allow non-prod everything', async () => {
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'integration', isProduction: false })).resolves.toBe(
                true
            );
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'delete', resource: 'connection', isProduction: false })).resolves.toBe(
                true
            );
            await expect(evaluator.evaluate({ role: 'production_support' }, { action: 'read', resource: 'secret_key', isProduction: false })).resolves.toBe(
                true
            );
        });
    });

    describe('development_full_access', () => {
        it('should deny all production access', async () => {
            await expect(
                evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'integration', isProduction: true })
            ).resolves.toBe(false);
            await expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'connection', isProduction: true })).resolves.toBe(
                false
            );
            await expect(
                evaluator.evaluate({ role: 'development_full_access' }, { action: 'write', resource: 'integration', isProduction: true })
            ).resolves.toBe(false);
            await expect(
                evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'environment', isProduction: true })
            ).resolves.toBe(false);
            await expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'secret_key', isProduction: true })).resolves.toBe(
                false
            );
            await expect(
                evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'connection_credential', isProduction: true })
            ).resolves.toBe(false);
        });

        it('should deny production sync commands', async () => {
            await expect(
                evaluator.evaluate({ role: 'development_full_access' }, { action: 'write', resource: 'sync_command', isProduction: true })
            ).resolves.toBe(false);
        });

        it('should deny team management', async () => {
            await expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'write', resource: 'team', isProduction: null })).resolves.toBe(
                false
            );
            await expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'write', resource: 'invite', isProduction: null })).resolves.toBe(
                false
            );
        });

        it('should deny environment creation', async () => {
            await expect(
                evaluator.evaluate({ role: 'development_full_access' }, { action: 'create', resource: 'environment', isProduction: null })
            ).resolves.toBe(false);
        });

        it('should allow non-prod everything', async () => {
            await expect(
                evaluator.evaluate({ role: 'development_full_access' }, { action: 'write', resource: 'integration', isProduction: false })
            ).resolves.toBe(true);
            await expect(
                evaluator.evaluate({ role: 'development_full_access' }, { action: 'delete', resource: 'connection', isProduction: false })
            ).resolves.toBe(true);
            await expect(
                evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'secret_key', isProduction: false })
            ).resolves.toBe(true);
            await expect(
                evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'connection_credential', isProduction: false })
            ).resolves.toBe(true);
        });

        it('should allow non-prod sync commands', async () => {
            await expect(
                evaluator.evaluate({ role: 'development_full_access' }, { action: 'write', resource: 'sync_command', isProduction: false })
            ).resolves.toBe(true);
        });

        it('should allow account-level reads (plans, user, getting-started)', async () => {
            await expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'plan', isProduction: null })).resolves.toBe(true);
        });
    });

    describe('unknown role', () => {
        it('should deny everything', async () => {
            // @ts-expect-error testing unknown role
            await expect(evaluator.evaluate({ role: 'unknown' }, { action: 'read', resource: 'integration', isProduction: false })).resolves.toBe(false);
        });
    });
});
