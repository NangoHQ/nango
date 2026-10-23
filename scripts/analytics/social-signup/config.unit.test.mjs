import assert from 'node:assert/strict';
import { test } from 'node:test';

import { configuration } from './reddit-config.mjs';

test('Reddit configuration stays disabled and dry until separately approved', () => {
    const c = configuration();
    assert.equal(c.enabled, false);
    assert.deepEqual(c.inputs, { deliveryApproved: { value: false }, dryRun: { value: true } });
    assert.deepEqual(c.filters.events, [{ id: 'auth:account_create', type: 'events' }]);
});
test('operational identifiers and encrypted token are required without placeholder defaults', () => {
    const c = configuration();
    for (const key of ['pixelId', 'startAt', 'accessToken']) {
        const input = c.inputs_schema.find((i) => i.key === key);
        assert.equal(input.required, true);
        assert.equal(input.templating, false);
        assert.equal('default' in input, false);
        assert.equal(key in c.inputs, false);
    }
    assert.equal(c.inputs_schema.find((i) => i.key === 'accessToken').secret, true);
});
