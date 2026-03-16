import { describe, expect, it } from 'vitest';

import { StaticEvaluator } from './evaluator.js';

import type { Permission } from './types.js';

const evaluator = new StaticEvaluator();

describe('StaticEvaluator', () => {
    describe('administrator', () => {
        it('should allow everything', () => {
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
                expect(evaluator.evaluate({ role: 'administrator' }, perm)).toBe(true);
            }
        });
    });

    describe('production_support', () => {
        it('should deny team management', () => {
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'team', isProduction: null })).toBe(false);
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'delete', resource: 'team_member', isProduction: null })).toBe(false);
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'invite', isProduction: null })).toBe(false);
        });

        it('should deny billing', () => {
            expect(evaluator.evaluate({ role: 'production_support' }, { action: '*', resource: 'billing', isProduction: null })).toBe(false);
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'plan', isProduction: null })).toBe(false);
        });

        it('should deny environment creation', () => {
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'create', resource: 'environment', isProduction: null })).toBe(false);
        });

        it('should deny is_production toggle', () => {
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'environment_production_flag', isProduction: null })).toBe(
                false
            );
        });

        it('should deny production write operations', () => {
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'integration', isProduction: true })).toBe(false);
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'connection', isProduction: true })).toBe(false);
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'flow', isProduction: true })).toBe(false);
        });

        it('should deny production secrets/credentials', () => {
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'read', resource: 'secret_key', isProduction: true })).toBe(false);
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'read', resource: 'connection_credential', isProduction: true })).toBe(false);
        });

        it('should allow production read operations', () => {
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'read', resource: 'integration', isProduction: true })).toBe(true);
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'read', resource: 'connection', isProduction: true })).toBe(true);
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'read', resource: 'environment', isProduction: true })).toBe(true);
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'read', resource: 'log', isProduction: true })).toBe(true);
        });

        it('should allow production sync commands', () => {
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'sync_command', isProduction: true })).toBe(true);
        });

        it('should allow non-prod everything', () => {
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'write', resource: 'integration', isProduction: false })).toBe(true);
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'delete', resource: 'connection', isProduction: false })).toBe(true);
            expect(evaluator.evaluate({ role: 'production_support' }, { action: 'read', resource: 'secret_key', isProduction: false })).toBe(true);
        });
    });

    describe('development_full_access', () => {
        it('should deny all production access', () => {
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'integration', isProduction: true })).toBe(false);
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'connection', isProduction: true })).toBe(false);
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'write', resource: 'integration', isProduction: true })).toBe(false);
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'environment', isProduction: true })).toBe(false);
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'secret_key', isProduction: true })).toBe(false);
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'connection_credential', isProduction: true })).toBe(
                false
            );
        });

        it('should deny production sync commands', () => {
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'write', resource: 'sync_command', isProduction: true })).toBe(false);
        });

        it('should deny team management', () => {
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'write', resource: 'team', isProduction: null })).toBe(false);
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'write', resource: 'invite', isProduction: null })).toBe(false);
        });

        it('should deny environment creation', () => {
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'create', resource: 'environment', isProduction: null })).toBe(false);
        });

        it('should allow non-prod everything', () => {
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'write', resource: 'integration', isProduction: false })).toBe(true);
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'delete', resource: 'connection', isProduction: false })).toBe(true);
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'secret_key', isProduction: false })).toBe(true);
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'connection_credential', isProduction: false })).toBe(
                true
            );
        });

        it('should allow non-prod sync commands', () => {
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'write', resource: 'sync_command', isProduction: false })).toBe(true);
        });

        it('should allow account-level reads (plans, user, getting-started)', () => {
            expect(evaluator.evaluate({ role: 'development_full_access' }, { action: 'read', resource: 'plan', isProduction: null })).toBe(true);
        });
    });

    describe('unknown role', () => {
        it('should deny everything', () => {
            // @ts-expect-error testing unknown role
            expect(evaluator.evaluate({ role: 'unknown' }, { action: 'read', resource: 'integration', isProduction: false })).toBe(false);
        });
    });
});
