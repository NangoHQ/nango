import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import { recordMock } from '../middleware/audit/testing.js';
import { recordIntegrationCreated } from './auditIntegration.js';

vi.mock('../audit.js', async (importOriginal) => (await import('../middleware/audit/testing.js')).auditModuleMock(importOriginal as never));

describe('recordIntegrationCreated', () => {
    const params = {
        integrationId: 'pg-resend',
        displayName: 'Resend',
        provider: 'resend',
        account: { id: 42, uuid: 'acc-uuid' },
        environment: { uuid: 'e0000000-0000-4000-8000-000000000001', name: 'dev' },
        auditAttribution: {
            kind: 'request' as const,
            actor: { type: 'user' as const, id: '7', display: 'Test User' },
            context: { ip: '203.0.113.7', userAgent: 'vitest' }
        }
    };

    beforeEach(() => {
        recordMock.mockReset().mockResolvedValue(undefined);
        flags.hasAuditTrail = true;
    });

    afterEach(() => {
        flags.hasAuditTrail = false;
    });

    it('records the integration the playground created, by whoever sent the chat request', async () => {
        await recordIntegrationCreated(params);

        expect(recordMock).toHaveBeenCalledTimes(1);
        expect(recordMock.mock.calls[0]?.[0]).toMatchObject({
            resource: 'integration',
            action: 'created',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000001', display: 'dev' },
            actor: { type: 'user', id: '7', display: 'Test User' },
            targets: [{ type: 'integration', id: 'pg-resend', display: 'Resend' }],
            context: { ip: '203.0.113.7', userAgent: 'vitest' },
            metadata: { provider: 'resend' }
        });
    });

    it('never throws when recording fails', async () => {
        recordMock.mockRejectedValue(new Error('store down'));

        await expect(recordIntegrationCreated(params)).resolves.toBeUndefined();
    });
});
