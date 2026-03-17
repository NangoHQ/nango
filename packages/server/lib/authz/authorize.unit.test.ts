import { beforeAll, describe, expect, it } from 'vitest';

import { authorize } from './authorize.js';
import { envScope, registerPermission } from './resolvers.js';

import type { RequestLocals } from '../utils/express.js';

function makeLocals(overrides: Partial<RequestLocals> = {}): RequestLocals {
    return {
        environment: {
            id: 1,
            uuid: 'test',
            name: 'prod',
            account_id: 1,
            secret_key: '',
            public_key: '',
            callback_url: null,
            webhook_url: null,
            webhook_url_secondary: null,
            websockets_path: null,
            hmac_enabled: false,
            always_send_webhook: false,
            send_auth_webhook: false,
            hmac_key: null,
            pending_secret_key: null,
            slack_notifications: false,
            webhook_receive_url: null,
            otlp_settings: null,
            is_production: true,
            created_at: new Date(),
            updated_at: new Date(),
            deleted: false,
            deleted_at: null
        },
        ...overrides
    };
}

describe('authorize', () => {
    beforeAll(() => {
        // Register the same permissions that routes.private.ts would register at boot
        registerPermission('PUT', '/team', { action: 'write', resource: 'team', scope: 'global' });
        registerPermission('DELETE', '/team/users/:id', { action: 'delete', resource: 'team_member', scope: 'global' });
        registerPermission('POST', '/invite', { action: 'write', resource: 'invite', scope: 'global' });
        registerPermission('DELETE', '/invite', { action: 'delete', resource: 'invite', scope: 'global' });
        registerPermission('GET', '/stripe/payment_methods', { action: '*', resource: 'billing', scope: 'global' });
        registerPermission('POST', '/stripe/payment_methods', { action: '*', resource: 'billing', scope: 'global' });
        registerPermission('DELETE', '/stripe/payment_methods', { action: '*', resource: 'billing', scope: 'global' });
        registerPermission('POST', '/plans/change', { action: 'write', resource: 'plan', scope: 'global' });
        registerPermission('POST', '/environments', { action: 'create', resource: 'environment', scope: 'global' });
        registerPermission('DELETE', '/environments', (l) => ({ action: 'delete', resource: 'environment', scope: envScope(l) }));
        registerPermission('GET', '/integrations', (l) => ({ action: 'read', resource: 'integration', scope: envScope(l) }));
        registerPermission('POST', '/integrations', (l) => ({ action: 'write', resource: 'integration', scope: envScope(l) }));
        registerPermission('GET', '/connections', (l) => ({ action: 'read', resource: 'connection', scope: envScope(l) }));
        registerPermission('GET', '/connections/:connectionId', (l) => ({ action: 'read', resource: 'connection', scope: envScope(l) }));
        registerPermission('DELETE', '/connections/:connectionId', (l) => ({ action: 'delete', resource: 'connection', scope: envScope(l) }));
        registerPermission('POST', '/flows/pre-built/deploy', (l) => ({ action: 'write', resource: 'flow', scope: envScope(l) }));
        registerPermission('POST', '/sync/command', (l) => ({ action: 'write', resource: 'sync_command', scope: envScope(l) }));
    });

    it('should always allow administrator', async () => {
        await expect(authorize('PUT', '/team', 'administrator', makeLocals())).resolves.toBe(true);
        await expect(authorize('DELETE', '/environments', 'administrator', makeLocals())).resolves.toBe(true);
        await expect(authorize('POST', '/integrations', 'administrator', makeLocals())).resolves.toBe(true);
    });

    it('should allow routes not in the resolver registry', async () => {
        await expect(authorize('GET', '/plans', 'development_full_access', makeLocals())).resolves.toBe(true);
        await expect(authorize('GET', '/user', 'development_full_access', makeLocals())).resolves.toBe(true);
        await expect(authorize('GET', '/getting-started', 'development_full_access', makeLocals())).resolves.toBe(true);
    });

    describe('Category 1 — route-only rules', () => {
        it('should deny non-administrator team management', async () => {
            await expect(authorize('PUT', '/team', 'production_support', makeLocals())).resolves.toBe(false);
            await expect(authorize('PUT', '/team', 'development_full_access', makeLocals())).resolves.toBe(false);
        });

        it('should deny non-administrator billing', async () => {
            await expect(authorize('GET', '/stripe/payment_methods', 'production_support', makeLocals())).resolves.toBe(false);
            await expect(authorize('POST', '/plans/change', 'production_support', makeLocals())).resolves.toBe(false);
        });

        it('should deny non-administrator environment creation', async () => {
            await expect(authorize('POST', '/environments', 'production_support', makeLocals())).resolves.toBe(false);
            await expect(authorize('POST', '/environments', 'development_full_access', makeLocals())).resolves.toBe(false);
        });
    });

    describe('Category 2 — route + environment rules', () => {
        it('should deny development_full_access all production access', async () => {
            const prodLocals = makeLocals();
            await expect(authorize('GET', '/integrations', 'development_full_access', prodLocals)).resolves.toBe(false);
            await expect(authorize('GET', '/connections', 'development_full_access', prodLocals)).resolves.toBe(false);
            await expect(authorize('POST', '/integrations', 'development_full_access', prodLocals)).resolves.toBe(false);
        });

        it('should deny development_full_access production sync commands', async () => {
            const prodLocals = makeLocals();
            await expect(authorize('POST', '/sync/command', 'development_full_access', prodLocals)).resolves.toBe(false);
        });

        it('should allow development_full_access non-production access', async () => {
            const devLocals = makeLocals({
                environment: { ...makeLocals().environment!, is_production: false }
            });
            await expect(authorize('GET', '/integrations', 'development_full_access', devLocals)).resolves.toBe(true);
            await expect(authorize('POST', '/integrations', 'development_full_access', devLocals)).resolves.toBe(true);
            await expect(authorize('DELETE', '/connections/:connectionId', 'development_full_access', devLocals)).resolves.toBe(true);
        });

        it('should allow development_full_access non-production sync commands', async () => {
            const devLocals = makeLocals({
                environment: { ...makeLocals().environment!, is_production: false }
            });
            await expect(authorize('POST', '/sync/command', 'development_full_access', devLocals)).resolves.toBe(true);
        });

        it('should deny production_support production write ops', async () => {
            const prodLocals = makeLocals();
            await expect(authorize('POST', '/integrations', 'production_support', prodLocals)).resolves.toBe(false);
            await expect(authorize('DELETE', '/connections/:connectionId', 'production_support', prodLocals)).resolves.toBe(false);
            await expect(authorize('POST', '/flows/pre-built/deploy', 'production_support', prodLocals)).resolves.toBe(false);
        });

        it('should allow production_support production read ops', async () => {
            const prodLocals = makeLocals();
            await expect(authorize('GET', '/integrations', 'production_support', prodLocals)).resolves.toBe(true);
            await expect(authorize('GET', '/connections/:connectionId', 'production_support', prodLocals)).resolves.toBe(true);
        });

        it('should allow production_support production sync commands', async () => {
            const prodLocals = makeLocals();
            await expect(authorize('POST', '/sync/command', 'production_support', prodLocals)).resolves.toBe(true);
        });
    });
});
