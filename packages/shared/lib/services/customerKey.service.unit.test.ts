import { describe, expect, it, vi } from 'vitest';

import customerKeyService from './customerKey.service.js';

import type { Knex } from 'knex';

describe('createWebhookSigningKey', () => {
    it.each(['', ' ', '\t\n'])('should reject a blank signing key %j before writing', async (secret) => {
        const trx = vi.fn<Knex>();
        const result = await customerKeyService.createWebhookSigningKey(trx, { accountId: 1, environmentId: 2, secret });

        if (result.isOk()) {
            throw new Error('Expected signing key creation to fail');
        }

        expect(result.error).toEqual(new Error('Webhook signing key cannot be blank'));
        expect(trx).not.toHaveBeenCalled();
    });
});
