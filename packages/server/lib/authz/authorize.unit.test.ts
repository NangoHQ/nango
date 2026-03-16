import { describe, expect, it } from 'vitest';

import { authorize } from './authorize.js';

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
    it('should always allow administrator', () => {
        expect(authorize('PUT', '/team', 'administrator', makeLocals())).toBe(true);
        expect(authorize('DELETE', '/environments', 'administrator', makeLocals())).toBe(true);
        expect(authorize('POST', '/integrations', 'administrator', makeLocals())).toBe(true);
    });

    it('should allow routes not in the resolver registry', () => {
        expect(authorize('GET', '/plans', 'development_full_access', makeLocals())).toBe(true);
        expect(authorize('GET', '/user', 'development_full_access', makeLocals())).toBe(true);
        expect(authorize('GET', '/getting-started', 'development_full_access', makeLocals())).toBe(true);
    });

    describe('Category 1 — route-only rules', () => {
        it('should deny non-administrator team management', () => {
            expect(authorize('PUT', '/team', 'production_support', makeLocals())).toBe(false);
            expect(authorize('PUT', '/team', 'development_full_access', makeLocals())).toBe(false);
        });

        it('should deny non-administrator billing', () => {
            expect(authorize('GET', '/stripe/payment_methods', 'production_support', makeLocals())).toBe(false);
            expect(authorize('POST', '/plans/change', 'production_support', makeLocals())).toBe(false);
        });

        it('should deny non-administrator environment creation', () => {
            expect(authorize('POST', '/environments', 'production_support', makeLocals())).toBe(false);
            expect(authorize('POST', '/environments', 'development_full_access', makeLocals())).toBe(false);
        });
    });

    describe('Category 2 — route + environment rules', () => {
        it('should deny development_full_access all production access', () => {
            const prodLocals = makeLocals();
            expect(authorize('GET', '/integrations', 'development_full_access', prodLocals)).toBe(false);
            expect(authorize('GET', '/connections', 'development_full_access', prodLocals)).toBe(false);
            expect(authorize('POST', '/integrations', 'development_full_access', prodLocals)).toBe(false);
        });

        it('should deny development_full_access production sync commands', () => {
            const prodLocals = makeLocals();
            expect(authorize('POST', '/sync/command', 'development_full_access', prodLocals)).toBe(false);
        });

        it('should allow development_full_access non-production access', () => {
            const devLocals = makeLocals({
                environment: { ...makeLocals().environment!, is_production: false }
            });
            expect(authorize('GET', '/integrations', 'development_full_access', devLocals)).toBe(true);
            expect(authorize('POST', '/integrations', 'development_full_access', devLocals)).toBe(true);
            expect(authorize('DELETE', '/connections/:connectionId', 'development_full_access', devLocals)).toBe(true);
        });

        it('should allow development_full_access non-production sync commands', () => {
            const devLocals = makeLocals({
                environment: { ...makeLocals().environment!, is_production: false }
            });
            expect(authorize('POST', '/sync/command', 'development_full_access', devLocals)).toBe(true);
        });

        it('should deny production_support production write ops', () => {
            const prodLocals = makeLocals();
            expect(authorize('POST', '/integrations', 'production_support', prodLocals)).toBe(false);
            expect(authorize('DELETE', '/connections/:connectionId', 'production_support', prodLocals)).toBe(false);
            expect(authorize('POST', '/flows/pre-built/deploy', 'production_support', prodLocals)).toBe(false);
        });

        it('should allow production_support production read ops', () => {
            const prodLocals = makeLocals();
            expect(authorize('GET', '/integrations', 'production_support', prodLocals)).toBe(true);
            expect(authorize('GET', '/connections/:connectionId', 'production_support', prodLocals)).toBe(true);
        });

        it('should allow production_support production sync commands', () => {
            const prodLocals = makeLocals();
            expect(authorize('POST', '/sync/command', 'production_support', prodLocals)).toBe(true);
        });
    });
});
