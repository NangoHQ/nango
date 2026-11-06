import { describe, expect, it } from 'vitest';

import { validation, validationWithNangoYaml } from './validation.js';

const scope = { kind: 'function', integrationId: 'github', name: 'contacts' } as const;
const flow = {
    type: 'sync',
    syncName: 'contacts',
    providerConfigKey: 'github',
    models: [],
    runs: null,
    fileBody: { js: 'compiled', ts: 'source' }
};
describe.each([
    { endpoint: 'preview', schema: validation, body: { flowConfigs: [flow], reconcile: false, debug: false } },
    { endpoint: 'deploy', schema: validationWithNangoYaml, body: { flowConfigs: [flow], reconcile: false, debug: false, nangoYamlBody: '' } }
])('$endpoint deployment scope validation', ({ schema, body }) => {
    it.each(['sync', 'action'])('accepts a function-scoped %s without deployMode', (type) => {
        const parsed = schema.parse({ ...body, flowConfigs: [{ ...flow, type }], reconciliationScope: scope });
        expect(parsed.scope).toEqual(scope);
    });

    it.each([{ kind: 'environment' }, { kind: 'integration', integrationId: 'github' }])(
        'accepts $kind scope without deployMode, including an empty package',
        (reconciliationScope) => {
            expect(schema.parse({ ...body, flowConfigs: [], reconciliationScope }).scope).toEqual(reconciliationScope);
        }
    );

    it.each([
        { label: 'no script', flows: [] },
        { label: 'multiple scripts', flows: [flow, { ...flow, syncName: 'other' }] },
        { label: 'the wrong integration', flows: [{ ...flow, providerConfigKey: 'slack' }] },
        { label: 'the wrong name', flows: [{ ...flow, syncName: 'other' }] }
    ])('rejects function scope with $label', ({ flows }) => {
        const parsed = schema.safeParse({ ...body, flowConfigs: flows, reconciliationScope: scope });
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.issues).toContainEqual(expect.objectContaining({ path: ['flowConfigs'] }));
        }
    });

    it.each(['onEventScriptsByProvider', 'postConnectionScriptsByProvider'])('rejects on-event changes in %s for function scope', (field) => {
        const scripts = [{ name: 'hook', fileBody: flow.fileBody, ...(field === 'onEventScriptsByProvider' ? { event: 'post-connection-creation' } : {}) }];
        const parsed = schema.safeParse({ ...body, reconciliationScope: scope, [field]: [{ providerConfigKey: 'github', scripts }] });
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.issues).toContainEqual(expect.objectContaining({ message: 'A function-scoped deployment cannot contain on-event scripts' }));
        }
    });

    it.each([{ deployMode: 'all' }, { deployMode: 'integration' }, { singleDeployMode: false }])('rejects contradictory legacy options %j', (options) => {
        const parsed = schema.safeParse({ ...body, reconciliationScope: scope, ...options });
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.issues).toContainEqual(expect.objectContaining({ path: ['reconciliationScope'] }));
        }
    });

    it.each([{ deployMode: 'single' }, { singleDeployMode: true }])('accepts matching legacy options %j with scope', (options) => {
        expect(schema.parse({ ...body, reconciliationScope: scope, ...options }).scope).toEqual(scope);
    });

    it.each([
        { options: { deployMode: 'single' }, expected: { kind: 'single' } },
        { options: { singleDeployMode: true }, expected: { kind: 'single' } },
        { options: { deployMode: 'integration' }, expected: { kind: 'integration', integrationId: 'github' } },
        { options: { deployMode: 'all' }, expected: { kind: 'environment' } },
        { options: { singleDeployMode: false }, expected: { kind: 'environment' } },
        { options: {}, expected: { kind: 'environment' } }
    ])('preserves scope inference for older clients: $options', ({ options, expected }) => {
        expect(schema.parse({ ...body, ...options }).scope).toEqual(expected);
    });

    it('preserves the empty-package no-op for older clients', () => {
        expect(schema.parse({ ...body, flowConfigs: [] }).scope).toEqual({ kind: 'none' });
    });

    it.each([{ deployMode: 'single' }, { singleDeployMode: true }])('accepts legacy single mode with empty or multi-script packages: %j', (options) => {
        for (const flowConfigs of [[], [flow, { ...flow, providerConfigKey: 'slack' }]]) {
            expect(schema.parse({ ...body, flowConfigs, ...options }).scope).toEqual({ kind: 'single' });
        }
    });
});
