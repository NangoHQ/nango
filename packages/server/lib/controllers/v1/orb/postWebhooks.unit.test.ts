import { describe, expect, it } from 'vitest';

import { handleWebhook } from './postWebhooks.js';

describe('handleWebhook', () => {
    it.each(['invoice.issued', 'customer.created', 'subscription.created'])('acknowledges %s without a subscription', async (type) => {
        const res = await handleWebhook({ id: 'evt_1', created_at: '2026-10-05T00:00:00Z', type });

        expect(res.isOk()).toBe(true);
    });
});
