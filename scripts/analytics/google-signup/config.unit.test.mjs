import { describe, expect, it } from 'vitest';

import { configuration } from './config.mjs';

const oauthKeys = ['oauthClientId', 'oauthClientSecret', 'oauthRefreshToken'];

describe('Google destination provisioning contract', () => {
    it.each([false, true])('requires operational values before PostHog accepts the configuration (diagnostics=%s)', (diagnostics) => {
        const config = configuration(diagnostics);
        const operationalKeys = [...(diagnostics ? ['requestId'] : ['customerId', 'loginCustomerId', 'conversionActionId', 'startAt']), ...oauthKeys];
        const stringInputs = config.inputs_schema.filter((input) => input.type === 'string');
        expect(stringInputs.map((input) => input.key).sort()).toEqual(operationalKeys.sort());
        for (const input of stringInputs) {
            // Verified against the connected PostHog validator: required missing strings reject even enabled=false.
            expect(input.required, input.key).toBe(true);
            expect(input.templating, input.key).toBe(false);
            expect(input).not.toHaveProperty('default');
            expect(config.inputs).not.toHaveProperty(input.key);
        }
        for (const key of oauthKeys) expect(stringInputs.find((input) => input.key === key)?.secret).toBe(true);
    });

    it.each([false, true])('keeps unprovisioned preparation disabled without credential placeholders (diagnostics=%s)', (diagnostics) => {
        const config = configuration(diagnostics);
        expect(config.enabled).toBe(false);
        expect(config.inputs.deliveryApproved).toEqual({ value: false });
        expect(config.inputs_schema.find((input) => input.key === 'deliveryApproved')).toMatchObject({ required: true, default: false });
        expect(config.inputs).toEqual(
            diagnostics ? { deliveryApproved: { value: false } } : { deliveryApproved: { value: false }, validateOnly: { value: true } }
        );
        expect(config.filters.filter_test_accounts).toBe(true);
    });

    it('keeps sender-only requirements out of the read-only diagnostics configuration', () => {
        const diagnostics = configuration(true);
        expect(diagnostics.inputs_schema.map((input) => input.key).sort()).toEqual([...oauthKeys, 'requestId', 'deliveryApproved'].sort());
        const sender = configuration();
        expect(sender.inputs.validateOnly).toEqual({ value: true });
        expect(sender.inputs_schema.find((input) => input.key === 'validateOnly')).toMatchObject({ required: true, default: true });
    });
});
